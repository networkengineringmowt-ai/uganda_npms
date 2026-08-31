import { chromium } from 'playwright';
import { Octokit } from '@octokit/rest';
import fs from 'node:fs';
import path from 'node:path';

const OWNER = 'networkengineringmowt-ai';
const ALL_REPOS = [
  'uganda_nrms', 'tricycles', 'uganda_npms', 'uganda_network_traffic',
  'uganda_ducar', 'uganda_nbms', 'uganda_gis_enterprise', 'bridge_mculverts',
  'kee', 'uganda_kee', 'uganda_kee_rss', 'uganda_ntis',
];

const SELF = (process.env.GITHUB_REPOSITORY || '').split('/')[1];
const TOKEN = process.env.GITHUB_TOKEN;
const SIBLINGS = ALL_REPOS.filter((r) => r !== SELF);
const URL = `https://${OWNER}.github.io/${SELF}/`;
const TODAY = new Date().toISOString().slice(0, 10);

const octokit = new Octokit({ auth: TOKEN });

async function auditSelf() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  let httpStatus = 0;
  let loadFailed = false;
  try {
    // 'domcontentloaded' rather than 'networkidle': dashboards with polling/websocket
    // traffic never go network-idle, which previously made healthy sites look "down".
    const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    httpStatus = resp ? resp.status() : 0;
    await page.waitForTimeout(4000); // let the SPA hydrate/render before inspecting it
  } catch (e) {
    loadFailed = true;
    consoleErrors.push(`navigation failed: ${e.message}`);
  }

  let bodyText = '';
  let brokenImages = [];
  let hashLinks = [];
  let chartElementCount = 0;
  let extractedFigures = [];
  let districtOptions = null;

  if (!loadFailed) {
    try {
      bodyText = await page.evaluate(() => document.body.innerText || '');
    } catch { /* page may be blank */ }

    try {
      brokenImages = await page.$$eval('img', (imgs) =>
        imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src)
      );
    } catch { /* ignore */ }

    try {
      hashLinks = await page.$$eval('a[href^="#"]', (as) =>
        [...new Set(as.map((a) => a.getAttribute('href')).filter((h) => h && h.length > 1))]
      );
    } catch { /* ignore */ }

    try {
      chartElementCount = await page.$$eval('canvas, svg', (els) => els.length);
    } catch { /* ignore */ }

    const figureRe = /([\d]{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(km|kilomet\w*)/gi;
    let m;
    while ((m = figureRe.exec(bodyText)) !== null) {
      const start = Math.max(0, m.index - 40);
      extractedFigures.push({
        value: parseFloat(m[1].replace(/,/g, '')),
        raw: m[0],
        context: bodyText.slice(start, m.index).trim().slice(-40),
      });
    }

    try {
      const opts = await page.$$eval('select option', (os) => os.map((o) => o.textContent.trim()));
      if (opts.length >= 100 && opts.length <= 160) districtOptions = opts;
    } catch { /* ignore */ }
  }

  await browser.close();

  const bodyTextLen = bodyText.trim().length;
  const technical = {
    httpStatus,
    loadFailed,
    pageRendered: bodyTextLen > 50,
    bodyTextLength: bodyTextLen,
    consoleErrors: consoleErrors.slice(0, 20),
    brokenImages,
    hashLinksFound: hashLinks,
    chartElementCount,
  };

  const majorTechnicalIssues = [];
  if (httpStatus !== 200) majorTechnicalIssues.push(`HTTP status ${httpStatus} (expected 200)`);
  if (loadFailed) majorTechnicalIssues.push('Page failed to load');
  if (!loadFailed && bodyTextLen <= 50) majorTechnicalIssues.push('Page rendered with little/no visible content (possible blank SPA shell)');
  if (consoleErrors.length > 0) majorTechnicalIssues.push(`${consoleErrors.length} console error(s) captured`);
  if (brokenImages.length > 0) majorTechnicalIssues.push(`${brokenImages.length} broken image(s): ${brokenImages.slice(0, 5).join(', ')}`);

  return { technical, majorTechnicalIssues, extractedFigures, districtOptions };
}

async function fetchSiblingLatestReport(repo) {
  try {
    const { data } = await octokit.repos.getContent({ owner: OWNER, repo, path: 'audit-log' });
    if (!Array.isArray(data) || data.length === 0) return null;
    const files = data.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f.name)).sort((a, b) => (a.name < b.name ? 1 : -1));
    if (files.length === 0) return null;
    const resp = await fetch(files[0].download_url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

function compareFigures(selfFigures, repo, siblingReport) {
  const discrepancies = [];
  if (!siblingReport || !siblingReport.accuracy || !siblingReport.accuracy.extractedFigures) return discrepancies;
  for (const sf of selfFigures) {
    const ctxWords = sf.context.toLowerCase().match(/[a-z]{4,}/g) || [];
    if (ctxWords.length === 0) continue;
    for (const of of siblingReport.accuracy.extractedFigures) {
      const octxWords = (of.context || '').toLowerCase().match(/[a-z]{4,}/g) || [];
      const shared = ctxWords.filter((w) => octxWords.includes(w));
      if (shared.length < 2) continue;
      if (sf.value === 0 || of.value === 0) continue;
      const pctDiff = Math.abs(sf.value - of.value) / Math.max(sf.value, of.value);
      if (pctDiff > 0.01) {
        discrepancies.push(
          `"${sf.raw}" (context: ...${sf.context}) vs ${repo}'s "${of.raw}" (context: ...${of.context}) — ${(pctDiff * 100).toFixed(1)}% difference`
        );
      }
    }
  }
  return discrepancies;
}

function compareDistricts(selfList, repo, siblingReport) {
  if (!selfList || !siblingReport || !siblingReport.consistency || !siblingReport.consistency.districtList) return null;
  const sibList = siblingReport.consistency.districtList;
  if (selfList.length !== sibList.length) {
    return `District list length differs from ${repo}: ${selfList.length} vs ${sibList.length}`;
  }
  const selfSet = new Set(selfList.map((s) => s.toLowerCase().trim()));
  const missing = sibList.filter((s) => !selfSet.has(s.toLowerCase().trim()));
  if (missing.length > 0) {
    return `District list differs from ${repo}: ${missing.length} name(s) not matching, e.g. ${missing.slice(0, 3).join(', ')}`;
  }
  return null;
}

async function upsertIssue({ title, body, labels }) {
  const { data: existing } = await octokit.issues.listForRepo({
    owner: OWNER, repo: SELF, state: 'open', labels: 'daily-audit', per_page: 20,
  });
  const match = existing.find((i) => i.title.startsWith('⚠️ Daily Audit:') || i.title === title);
  if (match) {
    await octokit.issues.update({ owner: OWNER, repo: SELF, issue_number: match.number, title, body });
    await octokit.issues.addLabels({ owner: OWNER, repo: SELF, issue_number: match.number, labels }).catch(() => {});
  } else {
    await octokit.issues.create({ owner: OWNER, repo: SELF, title, body, labels });
  }
}

async function closeStaleIssue() {
  const { data: existing } = await octokit.issues.listForRepo({
    owner: OWNER, repo: SELF, state: 'open', labels: 'daily-audit', per_page: 20,
  });
  for (const issue of existing) {
    await octokit.issues.update({ owner: OWNER, repo: SELF, issue_number: issue.number, state: 'closed' });
    await octokit.issues.createComment({
      owner: OWNER, repo: SELF, issue_number: issue.number,
      body: `Resolved — daily audit on ${TODAY} found no outstanding issues.`,
    });
  }
}

async function main() {
  const self = await auditSelf();

  const siblingReports = {};
  for (const repo of SIBLINGS) {
    siblingReports[repo] = await fetchSiblingLatestReport(repo);
  }

  const accuracyDiscrepancies = [];
  const consistencyNotes = [];
  for (const repo of SIBLINGS) {
    const rep = siblingReports[repo];
    if (!rep) {
      consistencyNotes.push(`${repo}: no audit-log available yet for comparison`);
      continue;
    }
    accuracyDiscrepancies.push(...compareFigures(self.extractedFigures, repo, rep));
    const districtNote = compareDistricts(self.districtOptions, repo, rep);
    if (districtNote) consistencyNotes.push(districtNote);
  }

  const report = {
    date: TODAY,
    repo: SELF,
    url: URL,
    technical: self.technical,
    accuracy: {
      extractedFigures: self.extractedFigures,
      discrepancies: accuracyDiscrepancies,
    },
    consistency: {
      districtList: self.districtOptions,
      notes: consistencyNotes,
    },
  };

  const dir = 'audit-log';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${TODAY}.json`), JSON.stringify(report, null, 2));

  const problems = [
    ...self.majorTechnicalIssues,
    ...accuracyDiscrepancies,
  ];

  if (problems.length === 0) {
    await closeStaleIssue();
    console.log('Audit clean — no issues found.');
    return;
  }

  const lines = [`# Daily Audit Report — ${TODAY}`, '', `Site: ${URL}`, ''];
  if (self.majorTechnicalIssues.length) {
    lines.push('## Technical', ...self.majorTechnicalIssues.map((s) => `- ${s}`), '');
  }
  if (accuracyDiscrepancies.length) {
    lines.push('## Cross-Site Accuracy Discrepancies', ...accuracyDiscrepancies.map((s) => `- ${s}`), '');
  }
  if (consistencyNotes.length) {
    lines.push('## Consistency Notes', ...consistencyNotes.map((s) => `- ${s}`), '');
  }
  lines.push(`Full report: \`audit-log/${TODAY}.json\``);

  await upsertIssue({
    title: `⚠️ Daily Audit: ${problems.length} issue(s) found`,
    body: lines.join('\n'),
    labels: ['daily-audit', 'bug'],
  });

  console.log(`Audit found ${problems.length} problem(s). Issue filed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
