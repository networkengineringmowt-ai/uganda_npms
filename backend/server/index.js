/**
 * Uganda National Roads — Local Data-Entry Write-Back Server
 * ───────────────────────────────────────────────────────────
 * Minimal Express server that persists all data-entry submissions to the
 * G: Drive repository (captures/<table>.jsonl) — the CANONICAL data store.
 * Supabase is an optional read-mirror only (SUPABASE_MIRROR=on). Trusted
 * local operators (DNR/UNRA field staff using the React app on a local
 * network) submit condition surveys, encroachment reports, gazette
 * updates, work orders, etc.; run drive_sync.py afterwards to fold the
 * captures into the app data bundle.
 *
 * SECURITY
 *  - The service_role key lives ONLY in server/.env (gitignored). It must
 *    NEVER be sent to, or embedded in, the browser bundle.
 *  - This server is intended to run on a trusted local network / VPN, not
 *    be exposed directly to the public internet. Add real authentication
 *    (e.g. Supabase Auth JWT verification) before doing that.
 *  - Writes are restricted to an explicit table allowlist below — there is
 *    no generic "write to any table" endpoint.
 *
 * Run:
 *    cd server && npm install && npm run dev
 *
 * The React app (Vite) should call this server at http://localhost:3001
 * for any write/update/delete operation; reads can continue to go straight
 * to Supabase via the public anon key (see src/lib/supabase.ts).
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const PORT        = process.env.PORT || 3001;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CORS_ORIGIN  = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean);
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PMS_DB_PATH = process.env.PMS_DB_PATH || path.resolve(SERVER_DIR, '..', 'data', 'traffic_platform.db');
const pmsDb = fs.existsSync(PMS_DB_PATH) ? new DatabaseSync(PMS_DB_PATH, { readOnly: true }) : null;

// Supabase is OPTIONAL — the canonical store is the G: Drive repository.
// Credentials are only needed for the legacy mirror (SUPABASE_MIRROR=on).
const supabaseAdmin = (SUPABASE_URL && SERVICE_KEY)
  ? createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;
if (!supabaseAdmin) {
  console.warn('[info] No Supabase credentials — running in G: Drive-only mode (mirror disabled).');
}

// ── G: Drive data store (canonical) ───────────────────────────────────────────
// All write-backs are persisted as JSONL files in the Google Drive repository.
// Supabase is only mirrored when SUPABASE_MIRROR=on.
const DRIVE_DIR = process.env.DRIVE_DATA_DIR
  || 'G:/My Drive/MOWT/Uganda National Road Network Repository/captures';
const MIRROR = (process.env.SUPABASE_MIRROR || 'off').toLowerCase() === 'on' && !!supabaseAdmin;

function persistDrive(table, op, records) {
  const dir = DRIVE_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${table}.jsonl`);
  const stamp = new Date().toISOString();
  const lines = records.map(r => JSON.stringify({ _op: op, _at: stamp, ...r })).join('\n') + '\n';
  fs.appendFileSync(file, lines, 'utf-8');
  return file;
}

// ── Audit log (G: Drive) — all logins + every change made through this server ─
// Appended to logs/audit_YYYY-MM.jsonl next to the captures directory.
const LOG_DIR = path.join(DRIVE_DIR, '..', 'logs');

function persistAudit(events) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const file = path.join(LOG_DIR, `audit_${new Date().toISOString().slice(0, 7)}.jsonl`);
  const stamp = new Date().toISOString();
  const lines = events.map(e => JSON.stringify({ _logged: stamp, ...e })).join('\n') + '\n';
  fs.appendFileSync(file, lines, 'utf-8');
  return file;
}

function auditChange(req, op, table, detail) {
  try {
    persistAudit([{
      type: 'change', op, table,
      user: req.get('x-user-email') || 'unknown',
      role: req.get('x-user-role') || '',
      ...detail,
    }]);
  } catch (e) { console.warn(`[audit] ${e.message}`); }
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '2mb' }));

// ── Request log (lightweight) ────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method}  ${req.path}`);
  next();
});

// ── Audit ingestion: POST /api/audit ─────────────────────────────────────────
// Body: { events: [{type, at, user, role, detail}, ...] } — the React app
// sends logins/logouts here (with any events queued while offline).
app.post('/api/audit', (req, res) => {
  try {
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    if (events.length === 0) {
      return res.status(400).json({ error: 'Body must include non-empty "events"' });
    }
    const file = persistAudit(events.slice(0, 1000).map(e => ({
      type: String(e.type || 'event'), at: e.at, user: e.user, role: e.role, detail: e.detail,
    })));
    res.status(201).json({ logged: events.length, file });
  } catch (err) {
    handleError(res, err);
  }
});

// ── Audit retrieval: GET /api/audit?month=YYYY-MM&limit=N ────────────────────
// Serves the G: Drive audit trail to the admin Activity Log view.
app.get('/api/audit', (req, res) => {
  try {
    let months = [];
    try {
      months = fs.readdirSync(LOG_DIR)
        .filter(f => /^audit_\d{4}-\d{2}\.jsonl$/.test(f))
        .map(f => f.slice(6, -6))
        .sort().reverse();
    } catch { /* no logs yet */ }
    const month = (typeof req.query.month === 'string' && months.includes(req.query.month))
      ? req.query.month : months[0];
    const limit = Math.min(parseInt(req.query.limit, 10) || 2000, 10000);
    let events = [];
    if (month) {
      events = fs.readFileSync(path.join(LOG_DIR, `audit_${month}.jsonl`), 'utf-8')
        .split('\n').filter(Boolean).slice(-limit)
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean)
        .reverse(); // newest first
    }
    res.json({ months, month: month ?? null, count: events.length, events });
  } catch (err) {
    handleError(res, err);
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'uganda-roads-data-entry-server', time: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────────────────────
// Table allowlist — only these tables may be written to via this server, and
// only via the operations listed. This intentionally excludes reference/
// lookup tables (e.g. hdm4_calibration, network_stats) that should be
// maintained through migrations/SQL, not the field data-entry UI.
// ─────────────────────────────────────────────────────────────────────────────
const WRITABLE_TABLES = {
  // RMS — condition survey submissions from the field
  road_link_condition:        { ops: ['insert', 'update'], idColumn: 'id' },
  // BMS — bridge inspection / condition / works write-back
  structure_condition_history:{ ops: ['insert', 'update'], idColumn: 'id' },
  inspections:                { ops: ['insert', 'update'], idColumn: 'id' },
  work_orders:                { ops: ['insert', 'update'], idColumn: 'id' },
  bridge_documents:           { ops: ['insert'],            idColumn: 'id' },
  // PMS — maintenance programme updates
  maintenance_programme:      { ops: ['insert', 'update'], idColumn: 'id' },
  // Road Reserve Management — encroachment register & gazette status
  road_reserve_records:       { ops: ['insert', 'update'], idColumn: 'id' },
  road_reserve_encroachments: { ops: ['insert', 'update'], idColumn: 'id' },
  road_reserve_gazette:       { ops: ['insert', 'update'], idColumn: 'id' },
  // Road Reserve Usage applications (MOWT Form 2) — PII; service_role only.
  // The anon key has SELECT-only on these (see supabase_schema.sql), so all
  // applicant registration + application/permit writes MUST come through here.
  road_reserve_applicants:    { ops: ['insert', 'update'], idColumn: 'id' },
  road_reserve_applications:  { ops: ['insert', 'update'], idColumn: 'id' },
  // Project tracking
  project_tracker:            { ops: ['insert', 'update'], idColumn: 'id' },
};

function assertWritable(table, op) {
  const cfg = WRITABLE_TABLES[table];
  if (!cfg) {
    const err = new Error(`Table "${table}" is not in the write-back allowlist`);
    err.status = 403;
    throw err;
  }
  if (!cfg.ops.includes(op)) {
    const err = new Error(`Operation "${op}" is not permitted on "${table}"`);
    err.status = 403;
    throw err;
  }
  return cfg;
}

// ── List allowlisted tables (for the admin UI to introspect) ─────────────────
app.get('/api/admin/tables', (_req, res) => {
  res.json({
    tables: Object.entries(WRITABLE_TABLES).map(([table, cfg]) => ({ table, ...cfg })),
  });
});

// ── Generic insert: POST /api/admin/:table ───────────────────────────────────
// Body: { record: {...} } or { records: [{...}, ...] }
app.post('/api/admin/:table', async (req, res) => {
  const { table } = req.params;
  try {
    assertWritable(table, 'insert');
    const payload = req.body?.records ?? (req.body?.record ? [req.body.record] : null);
    if (!Array.isArray(payload) || payload.length === 0) {
      return res.status(400).json({ error: 'Request body must include "record" or non-empty "records"' });
    }
    // Canonical store: append to the G: Drive JSONL for this table.
    const file = persistDrive(table, 'insert', payload);
    auditChange(req, 'insert', table, { rows: payload.length });
    // Optional Supabase mirror (SUPABASE_MIRROR=on in server/.env)
    let mirrored = false;
    if (MIRROR) {
      const onConflict = typeof req.query.upsert === 'string' && req.query.upsert.trim();
      const q = onConflict
        ? supabaseAdmin.from(table).upsert(payload, { onConflict }).select()
        : supabaseAdmin.from(table).insert(payload).select();
      const { error } = await q;
      mirrored = !error;
      if (error) console.warn(`[mirror] supabase ${table}: ${error.message}`);
    }
    res.status(201).json({ inserted: payload.length, store: 'gdrive', file, mirrored });
  } catch (err) {
    handleError(res, err);
  }
});

// ── Generic update: PATCH /api/admin/:table/:id ───────────────────────────────
// Body: { patch: {...} }
app.patch('/api/admin/:table/:id', async (req, res) => {
  const { table, id } = req.params;
  try {
    const cfg = assertWritable(table, 'update');
    const patch = req.body?.patch;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Request body must include a "patch" object' });
    }
    const file = persistDrive(table, 'update', [{ [cfg.idColumn]: id, ...patch }]);
    auditChange(req, 'update', table, { id, fields: Object.keys(patch) });
    let mirrored = false;
    if (MIRROR) {
      const { error } = await supabaseAdmin.from(table).update(patch).eq(cfg.idColumn, id).select();
      mirrored = !error;
      if (error) console.warn(`[mirror] supabase ${table}: ${error.message}`);
    }
    res.json({ updated: 1, store: 'gdrive', file, mirrored });
  } catch (err) {
    handleError(res, err);
  }
});

// ── Convenience endpoints — Road Reserve Management write-back ───────────────
// These wrap the generic handlers with friendlier paths for the
// RoadReserveSection "Encroachment Register" and "Gazette & Legal Status"
// tabs once they're connected to live data (see // TODO comments in
// src/modules/RoadReserve/RoadReserveSection.tsx).

app.post('/api/admin/road-reserve/records', async (req, res) => {
  try {
    assertWritable('road_reserve_records', 'insert');
    const payload = req.body?.records ?? (req.body?.record ? [req.body.record] : null);
    if (!Array.isArray(payload) || payload.length === 0) {
      return res.status(400).json({ error: 'Request body must include "record" or non-empty "records"' });
    }
    const file = persistDrive('road_reserve_records', 'insert', payload);
    auditChange(req, 'insert', 'road_reserve_records', { rows: payload.length });
    let mirrored = false;
    if (MIRROR) {
      const { error } = await supabaseAdmin.from('road_reserve_records').insert(payload).select();
      mirrored = !error;
      if (error) console.warn(`[mirror] supabase road_reserve_records: ${error.message}`);
    }
    res.status(201).json({ inserted: payload.length, store: 'gdrive', file, mirrored });
  } catch (err) {
    handleError(res, err);
  }
});

app.patch('/api/admin/road-reserve/records/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const cfg = assertWritable('road_reserve_records', 'update');
    const patch = req.body?.patch;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ error: 'Request body must include a "patch" object' });
    }
    const file = persistDrive('road_reserve_records', 'update', [{ [cfg.idColumn]: id, ...patch }]);
    auditChange(req, 'update', 'road_reserve_records', { id, fields: Object.keys(patch) });
    let mirrored = false;
    if (MIRROR) {
      const { error } = await supabaseAdmin
        .from('road_reserve_records').update(patch).eq(cfg.idColumn, id).select();
      mirrored = !error;
      if (error) console.warn(`[mirror] supabase road_reserve_records: ${error.message}`);
    }
    res.json({ updated: 1, store: 'gdrive', file, mirrored });
  } catch (err) {
    handleError(res, err);
  }
});

// ── Fable 5 chat proxy ────────────────────────────────────────────────────────
// Proxies the Road Asset Bot's LLM chat to the Claude API so the Anthropic key
// stays server-side (set ANTHROPIC_API_KEY in server/.env). Body:
//   { messages: [{role:'user'|'assistant', content:string}, ...], system: string }
// NPMS analytical backend - read-only, parameterized SQLite queries.
function requirePmsDb(res) {
  if (!pmsDb) {
    res.status(503).json({ error: `NPMS database not found at ${PMS_DB_PATH}` });
    return false;
  }
  return true;
}

function parsePayload(row) {
  const { payload_json, ...rest } = row;
  return { ...rest, payload: JSON.parse(payload_json) };
}

app.get('/api/pms/dashboard', (_req, res) => {
  try {
    if (!requirePmsDb(res)) return;
    const cards = pmsDb.prepare('SELECT * FROM pms_infographics ORDER BY sort_order').all().map(parsePayload);
    const model = pmsDb.prepare(`
      SELECT model_run_id,model_name,model_version,algorithm,training_rows,
             validation_metrics_json,trained_at,reporting_at,status
      FROM pms_model_runs ORDER BY model_run_id DESC LIMIT 1
    `).get();
    const sources = pmsDb.prepare('SELECT * FROM pms_v_source_coverage ORDER BY repository_group,extension').all();
    const modelPayload = model ? { ...model, validation_metrics: JSON.parse(model.validation_metrics_json) } : null;
    if (modelPayload) delete modelPayload.validation_metrics_json;
    res.json({
      generated_at: cards[0]?.generated_at ?? null,
      reporting_at: model?.reporting_at ?? null,
      model: modelPayload,
      source_coverage: sources,
      infographics: cards,
    });
  } catch (err) { handleError(res, err); }
});

app.get('/api/pms/links', (req, res) => {
  try {
    if (!requirePmsDb(res)) return;
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 250, 1), 2000);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const region = typeof req.query.region === 'string' && req.query.region ? req.query.region : null;
    const surface = typeof req.query.surface === 'string' && req.query.surface ? req.query.surface : null;
    const search = typeof req.query.search === 'string' && req.query.search ? `%${req.query.search}%` : null;
    const rows = pmsDb.prepare(`
      SELECT * FROM pms_v_current_link_state
      WHERE (? IS NULL OR maintenance_region=?)
        AND (? IS NULL OR surface_type=?)
        AND (? IS NULL OR link_id LIKE ? OR link_name LIKE ?)
      ORDER BY link_id LIMIT ? OFFSET ?
    `).all(region, region, surface, surface, search, search, search, limit, offset);
    res.json({ count: rows.length, limit, offset, rows });
  } catch (err) { handleError(res, err); }
});

app.get('/api/pms/links/:linkId', (req, res) => {
  try {
    if (!requirePmsDb(res)) return;
    const linkId = req.params.linkId;
    const state = pmsDb.prepare('SELECT * FROM pms_v_current_link_state WHERE link_id=?').get(linkId);
    if (!state) return res.status(404).json({ error: `Unknown road link ${linkId}` });
    const observations = pmsDb.prepare(`
      SELECT o.survey_date,o.survey_year,o.iri_m_per_km,o.rut_depth_mm,o.vci,o.pci,
             o.cracking_percent,o.condition_class,o.data_quality,f.relative_path AS source_file
      FROM pms_condition_observations o JOIN pms_source_files f ON f.source_id=o.source_id
      WHERE o.link_id=? ORDER BY COALESCE(o.survey_date,printf('%04d-12-31',o.survey_year))
    `).all(linkId);
    const assets = pmsDb.prepare(`
      SELECT asset_type,asset_subtype,COUNT(*) AS asset_count,
             AVG(quantity) AS average_quantity,AVG(length_m) AS average_length_m
      FROM pms_inventory_assets WHERE link_id=? GROUP BY asset_type,asset_subtype ORDER BY asset_count DESC
    `).all(linkId);
    const values = pmsDb.prepare(`
      SELECT d.canonical_name,d.unit,c.value_numeric,c.value_text,c.reporting_at,c.observed_at,
             c.value_method,c.confidence,f.relative_path AS source_file,m.model_name,m.model_version
      FROM pms_current_values c JOIN pms_variable_definitions d ON d.variable_id=c.variable_id
      LEFT JOIN pms_source_files f ON f.source_id=c.source_id
      LEFT JOIN pms_model_runs m ON m.model_run_id=c.model_run_id
      WHERE c.link_id=? ORDER BY d.category,d.canonical_name
    `).all(linkId);
    res.json({ state, observations, assets, current_values: values });
  } catch (err) { handleError(res, err); }
});

app.get('/api/pms/sources', (_req, res) => {
  try {
    if (!requirePmsDb(res)) return;
    res.json({
      coverage: pmsDb.prepare('SELECT * FROM pms_v_source_coverage ORDER BY repository_group,extension').all(),
      files: pmsDb.prepare(`
        SELECT source_id,repository_group,relative_path,extension,byte_size,modified_at,
               ingestion_status,record_count,error_message,ingested_at
        FROM pms_source_files ORDER BY repository_group,relative_path
      `).all(),
    });
  } catch (err) { handleError(res, err); }
});

app.get('/api/pms/variables', (_req, res) => {
  try {
    if (!requirePmsDb(res)) return;
    res.json({ variables: pmsDb.prepare('SELECT * FROM pms_v_variable_lineage ORDER BY category,canonical_name').all() });
  } catch (err) { handleError(res, err); }
});

app.post('/api/bot/chat', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured in server/.env' });
    }
    const { messages, system } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Body must include non-empty "messages"' });
    }
    let Anthropic;
    try {
      ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
    } catch {
      return res.status(503).json({ error: 'Run "npm install" in server/ (missing @anthropic-ai/sdk)' });
    }
    const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env
    const response = await anthropic.messages.create({
      model: 'claude-fable-5',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system: typeof system === 'string' ? system : undefined,
      messages,
    });
    const block = response.content.find(b => b.type === 'text');
    res.json({ text: block ? block.text : '', usage: response.usage });
  } catch (err) {
    handleError(res, err);
  }
});

// ── Error helper ──────────────────────────────────────────────────────────────
function handleError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message, details: err.details });
}

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

app.listen(PORT, () => {
  console.log(`\n  Uganda Roads — Data-Entry Write-Back Server`);
  console.log(`  ──────────────────────────────────────────`);
  console.log(`  Listening on  http://localhost:${PORT}`);
  console.log(`  Data store    ${DRIVE_DIR}  (G: Drive, canonical)`);
  console.log(`  Supabase      ${MIRROR ? `mirror ON → ${SUPABASE_URL}` : 'mirror off'}`);
  console.log(`  CORS origins  ${CORS_ORIGIN.join(', ')}`);
  console.log(`  Writable tables: ${Object.keys(WRITABLE_TABLES).join(', ')}\n`);
});
