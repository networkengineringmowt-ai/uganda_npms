/* ============================================================
   Uganda NPMS -- optional Supabase backend status indicator
   ------------------------------------------------------------
   This site's dashboard numbers (RAW_DATA, embedded above) are a
   fixed, pre-computed rollup -- not fetched from a database. The
   raw survey tables in supabase_migration/migration_and_seed.sql
   can be loaded into Supabase independently, but no job exists yet
   to regenerate RAW_DATA's rollups from that raw data, so doing so
   would risk showing silently wrong numbers. This script therefore
   never touches RAW_DATA or any figure on the page -- it only shows
   whether a configured Supabase project is reachable, so it stays
   obvious that the dashboard is reading its static dataset even
   after a backend is connected.

   Until SUPABASE_URL / SUPABASE_ANON_KEY below are filled in, this
   script does nothing but render the "Static dataset" badge. The
   anon key is Supabase's public, browser-safe key (protected by the
   read-only RLS policies in the migration file) -- never put the
   service_role key here or anywhere in this repo.
   ============================================================ */
(function () {
  "use strict";

  var SUPABASE_URL = "";
  var SUPABASE_ANON_KEY = "";
  var isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

  function renderBadge(state, label, title) {
    var host = document.querySelector('[data-npms-header-controls]');
    if (!host) return;
    var existing = document.getElementById('npmsBackendBadge');
    if (existing) existing.remove();
    var palette = {
      static: 'bg-slate-800 text-slate-400 border-slate-700',
      live: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      unreachable: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    };
    var badge = document.createElement('div');
    badge.id = 'npmsBackendBadge';
    badge.title = title || '';
    badge.className = 'hidden sm:flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border ' + (palette[state] || palette.static);
    badge.textContent = label;
    host.insertBefore(badge, host.firstChild);
  }

  function checkLive() {
    fetch(SUPABASE_URL + '/rest/v1/npms_pavement_visual_condition?select=id&limit=1', {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
    }).then(function (res) {
      if (res.ok) {
        renderBadge('live', 'Backend: Live (raw tables)', 'Supabase raw survey tables are reachable. Dashboard figures above are still the static rollup.');
      } else {
        renderBadge('unreachable', 'Backend: Unreachable', 'Supabase project configured but did not respond.');
      }
    }).catch(function () {
      renderBadge('unreachable', 'Backend: Unreachable', 'Could not reach the configured Supabase project.');
    });
  }

  function start() {
    if (!isConfigured) {
      renderBadge('static', 'Static dataset', "No live backend configured -- figures are the site's fixed dataset.");
      return;
    }
    checkLive();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
