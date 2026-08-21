import { r as React } from './index.npms-CkKBq4ku.js';

const h = React.createElement;
const base = '/uganda_npms/data/';

const DATASETS = [
  ['road_network.geojson','Published Pavement Map Geometry','Network',1013,2528,true],
  ['network_links.json','National Road Links','Network',1017,445],
  ['network2026.geojson','2026 Road Network GIS','Network',1014,3203],
  ['ndpiv2026.geojson','NDP IV Road Network','Network',1014,2105],
  ['gisnetwork18062025.geojson','2025 GIS Road Network','Network',1013,2026],
  ['network_stats.json','Network Statistics','Network',16,3],
  ['network_summary.json','Network Performance Summary','Network',10,1],
  ['road_inventory_2023.json','Road Asset Inventory 2023','Network',191,158],
  ['road_surface.json','Road Surface Register','Network',987,24],
  ['central_network_db.json','Central Network Database','Network',1017,5220],
  ['categorical_registry.json','PMS Categorical Registry','Network',14,5],
  ['link_condition_lookup.json','Link Condition Lookup','Condition',1017,167],
  ['romdas_survey_sections.geojson','ROMDAS Survey Sections','Condition',128,908],
  ['romdas_sections_summary.json','ROMDAS Survey Summary','Condition',7,1],
  ['romdas_predictions.json','ROMDAS Condition Predictions','Condition',1017,574],
  ['romdas_calibration.json','ROMDAS Calibration','Condition',7,6],
  ['deterioration_summary.json','Deterioration Model Summary','Condition',14,27],
  ['cross_section_analytics.json','Cross-section Analytics','Condition',13,3],
  ['maintenance_programme.json','Maintenance Programme','Operations',1017,405],
  ['annual_workplans.json','Annual Workplans','Operations',4,8],
  ['oprc_ndpiv.json','OPRC & NDP IV Projects','Operations',33,12],
  ['bridge_works_2026.json','Bridge Works 2026','Operations',14,21],
  ['fwd_surveys.json','FWD Structural Surveys','Evidence',10,170],
  ['pavement_images.json','Pavement Image Register','Evidence',221,62],
  ['photo_manifest.json','Photo Evidence Manifest','Evidence',902,264],
  ['image_defects_summary.json','AI Image Defects Summary','Evidence',20,3],
  ['bot_results.json','Road Survey Results','Evidence',15,54],
  ['ml_model_metrics.json','Machine-learning Metrics','Evidence',6,1],
  ['model_feature_importance.json','Model Feature Importance','Evidence',4,5],
  ['traffic_predictions_lite.json','Traffic Predictions','Traffic',1020,500],
  ['traffic_predictions.geojson','Traffic Predictions GIS','Traffic',1020,18442],
  ['traffic_summary.json','Traffic Summary','Traffic',4,1],
  ['tcs_stations.json','Traffic Count Stations','Traffic',298,80],
  ['atc_adt_2026.json','2026 ATC / ADT','Traffic',3,9],
  ['growth_factors_summary.json','Traffic Growth Factors','Traffic',8,58],
  ['overloading_summary.json','Axle Overloading Analysis','Traffic',11,126],
  ['bridges2026.geojson','Bridge Inventory 2026','Structures',546,468],
  ['bridges2025.geojson','Bridge Inventory 2025','Structures',483,410],
  ['bridges_summary.json','Structures Summary','Structures',13,407],
  ['maintenance_stations.geojson','Maintenance Stations','Structures',23,5],
  ['new_weigh_bridges.geojson','Weighbridge Register','Structures',21,5],
  ['ferries.geojson','Ferry Locations','Structures',40,21],
  ['ferry.geojson','Ferry Reference Layer','Structures',11,3],
  ['uganda_ferries.geojson','National Ferry Register','Structures',4,1],
  ['ferryroutes.geojson','Ferry Routes','Structures',14,7],
  ['uganda_lakes.geojson','Uganda Lakes','Spatial',103,988],
  ['uganda_rivers.geojson','Uganda Rivers','Spatial',32038,9355],
  ['protected_areas.geojson','Protected Areas','Spatial',651,8005],
  ['uganda_railways.geojson','Uganda Railways','Spatial',4,1],
  ['rail_existing.geojson','Existing Rail Network','Spatial',15,41],
  ['rail_proposed_ea_sg_plan.geojson','Proposed SGR Network','Spatial',6,6],
  ['airports.geojson','Airport Register','Spatial',26,13],
  ['uganda_airports.geojson','National Airport Register','Spatial',9,2],
  ['ug_airfields.geojson','Airfields Register','Spatial',12,3],
  ['platform_schema.json','Platform Data Schema','Platform',1,93],
  ['comprehensive_schema.json','Comprehensive Schema','Platform',2,15],
  ['bundle.json','Platform Data Bundle','Platform',6,83],
];

const items = DATASETS.map(([file, label, category, records, kb, root]) => ({ file, label, category, records, kb, root }));
const modeCategories = {
  network: ['Network'], condition: ['Condition'], operations: ['Operations'], evidence: ['Evidence'], traffic: ['Traffic'],
  structures: ['Structures'], spatial: ['Spatial'], platform: ['Platform'], catalogue: [],
};

function compact(value) {
  if (value == null) return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  const text = JSON.stringify(value);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function toRows(data) {
  if (Array.isArray(data)) return data.map((row) => row && typeof row === 'object' ? row : { value: row });
  if (Array.isArray(data?.features)) return data.features.map((feature) => ({ ...(feature.properties || {}), geometry: feature.geometry?.type || 'Geometry' }));
  for (const key of ['all_links','link_predictions','links','surveys','sites','top_priority_links']) {
    if (Array.isArray(data?.[key])) return data[key].map((row) => ({ dataset_group: key, ...row }));
  }
  const combined = ['ndpiv_projects','oprc_lots','road_condition','pms_by_region'].flatMap((key) => Array.isArray(data?.[key]) ? data[key].map((row) => ({ dataset_group: key, ...row })) : []);
  if (combined.length) return combined;
  for (const key of ['tables','years']) {
    if (data?.[key] && typeof data[key] === 'object') return Object.entries(data[key]).map(([record_id, value]) => value && typeof value === 'object' ? { dataset_group: key, record_id, ...value } : { dataset_group: key, record_id, value });
  }
  if (data && typeof data === 'object') return Object.entries(data).map(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return { record_id: key, ...value };
    return { metric: key, value };
  });
  return [];
}

function csvEscape(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }

export function PMSDataExplorer({ mode = 'catalogue', initialFile, title, description }) {
  const allowed = modeCategories[mode] || [];
  const available = allowed.length ? items.filter((item) => allowed.includes(item.category)) : items;
  const initial = available.find((item) => item.file === initialFile) || available[0] || items[0];
  const [selected, setSelected] = React.useState(initial);
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState('');
  const [datasetQuery, setDatasetQuery] = React.useState('');
  const [category, setCategory] = React.useState('All');
  const [page, setPage] = React.useState(0);

  React.useEffect(() => {
    setSelected(available.find((item) => item.file === initialFile) || available[0] || items[0]);
    setDatasetQuery(''); setCategory('All');
  }, [mode, initialFile]);

  React.useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setQuery(''); setPage(0);
    fetch(`${selected.root ? '/uganda_npms/' : base}${selected.file}`).then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json();
    }).then((json) => { if (active) setData(json); }).catch((reason) => { if (active) setError(`Unable to load ${selected.label}: ${reason.message}`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selected.file]);

  const rows = React.useMemo(() => toRows(data), [data]);
  const filteredRows = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row || {}).some((value) => compact(value).toLowerCase().includes(needle)));
  }, [rows, query]);
  const columns = React.useMemo(() => {
    const scores = new Map();
    rows.slice(0, 1000).forEach((row) => Object.keys(row || {}).forEach((key) => scores.set(key, (scores.get(key) || 0) + 1)));
    return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
  }, [rows]);
  const categories = ['All', ...new Set(available.map((item) => item.category))];
  const shownDatasets = available.filter((item) => (category === 'All' || item.category === category) && `${item.label} ${item.file}`.toLowerCase().includes(datasetQuery.toLowerCase()));
  const pageSize = 25;
  const pages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const visibleRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize);

  function exportCsv() {
    const csv = [columns.map(csvEscape).join(','), ...filteredRows.map((row) => columns.map((column) => csvEscape(compact(row?.[column]))).join(','))].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = selected.file.replace(/\.(geo)?json$/i, '.csv');
    link.click(); URL.revokeObjectURL(link.href);
  }

  return h('section', { className: 'pms-data-explorer' },
    h('aside', { className: 'pms-data-sidebar' },
      h('div', { className: 'pms-data-sidebar-head' }, h('span', null, 'DATA LIBRARY'), h('strong', null, `${available.length} datasets`), h('small', null, `${available.reduce((sum, item) => sum + item.records, 0).toLocaleString()} indexed records`)),
      h('input', { type: 'search', value: datasetQuery, onChange: (event) => setDatasetQuery(event.target.value), placeholder: 'Find a dataset…', 'aria-label': 'Find a dataset' }),
      categories.length > 2 && h('div', { className: 'pms-data-categories' }, categories.map((name) => h('button', { key: name, className: category === name ? 'active' : '', onClick: () => setCategory(name) }, name))),
      h('div', { className: 'pms-dataset-list' }, shownDatasets.map((item) => h('button', { key: item.file, className: selected.file === item.file ? 'active' : '', onClick: () => setSelected(item) }, h('i'), h('span', null, h('strong', null, item.label), h('small', null, `${item.category} · ${item.records.toLocaleString()} records`)), h('b', null, `${item.kb.toLocaleString()} KB`))))
    ),
    h('div', { className: 'pms-data-main' },
      h('header', { className: 'pms-data-heading' }, h('div', null, h('span', { className: 'pms-eyebrow' }, `${selected.category.toUpperCase()} · ${(title || 'NPMS DATA EXPLORER').toUpperCase()}`), h('h1', null, selected.label), h('p', null, description || `Explore the complete ${selected.label.toLowerCase()} dataset with searchable records and source-level detail.`)), h('button', { onClick: exportCsv, disabled: !rows.length }, 'Export CSV')),
      h('div', { className: 'pms-data-kpis' },
        h('article', null, h('span', null, 'Records'), h('strong', null, rows.length.toLocaleString()), h('small', null, selected.file)),
        h('article', null, h('span', null, 'Fields'), h('strong', null, columns.length.toLocaleString()), h('small', null, 'Most populated columns')),
        h('article', null, h('span', null, 'Source size'), h('strong', null, `${selected.kb.toLocaleString()} KB`), h('small', null, 'Published repository asset')),
        h('article', null, h('span', null, 'Category'), h('strong', null, selected.category), h('small', null, 'National data catalogue'))
      ),
      h('div', { className: 'pms-table-toolbar' }, h('input', { type: 'search', value: query, onChange: (event) => { setQuery(event.target.value); setPage(0); }, placeholder: 'Search every field…', 'aria-label': 'Search dataset records' }), h('span', null, `${filteredRows.length.toLocaleString()} matching records`)),
      h('div', { className: 'pms-modern-table-wrap' }, loading ? h('div', { className: 'pms-data-state' }, 'Loading published data…') : error ? h('div', { className: 'pms-data-state error' }, error) :
        h('table', { className: 'pms-modern-table' }, h('thead', null, h('tr', null, columns.map((column) => h('th', { key: column }, column.replaceAll('_', ' '))))), h('tbody', null, visibleRows.map((row, rowIndex) => h('tr', { key: rowIndex }, columns.map((column) => h('td', { key: column, title: compact(row?.[column]) }, compact(row?.[column])))))))
      ),
      h('footer', { className: 'pms-table-footer' }, h('span', null, `Page ${page + 1} of ${pages}`), h('div', null, h('button', { disabled: page === 0, onClick: () => setPage((value) => Math.max(0, value - 1)) }, 'Previous'), h('button', { disabled: page + 1 >= pages, onClick: () => setPage((value) => Math.min(pages - 1, value + 1)) }, 'Next')))
    )
  );
}

export const D = PMSDataExplorer;
