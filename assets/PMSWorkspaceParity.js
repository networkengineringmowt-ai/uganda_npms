import { r as React, u as useAuth } from './index.npms-CkKBq4ku.js';
import { D as PMSDataExplorer } from './PMSDataExplorer.js';

const Overview = React.lazy(() => import('./CrossSectionAnalytics-D4cfc8XX.js'));
const PavementMap = React.lazy(() => import('./GISMapView-ChKggw8h.js'));
const LinkRegistry = React.lazy(() => import('./PMSDataView-EmW_6Xsa.js'));
const AssetInventory = React.lazy(() => import('./InventoryData-B7VgXe5E.js'));
const ConditionHistory = React.lazy(() => import('./ConditionData-Bemwx5ex.js'));
const PhotoEvidence = React.lazy(() => import('./AIVisionDashboard-PcQIw3Al.js'));
const CriticalLinks = React.lazy(() => import('./CriticalLinks-BkgbPnLn.js'));
const StructuralAnalytics = React.lazy(() => import('./FWDAnalytics-DHLS24zo.js'));
const DigitalTwin = React.lazy(() => import('./DigitalTwin-C5k8b0vP.js'));
const PavementWorks = React.lazy(() => import('./PavementCatalogue-DLIX40XH.js'));
const h = React.createElement;

const SECTIONS = [
  { id: 'overview', label: 'Overview', symbol: '▦', defaultTab: 'overview', groups: [] },
  {
    id: 'network', label: 'Inventory & Condition', symbol: '⌖', defaultTab: 'map',
    groups: [
      { label: 'Pavement Network', tabs: [
        { id: 'map', label: 'GIS Map', symbol: '⌖' },
        { id: 'registry', label: 'Link Registry', symbol: '▤' },
        { id: 'inventory', label: 'Asset Inventory', symbol: '▥' },
        { id: 'digital_twin', label: 'Digital Twin', symbol: '◇' },
        { id: 'critical', label: 'Critical Links', symbol: '△' },
      ] },
      { label: 'Analytics', tabs: [
        { id: 'analytics', label: 'Analytics', symbol: '↗' },
        { id: 'data_explorer', label: 'Data Explorer', symbol: '▦' },
      ] },
    ],
  },
  {
    id: 'evidence', label: 'Photos', symbol: '▣', defaultTab: 'photos',
    groups: [{ label: 'Evidence Library', tabs: [
      { id: 'photos', label: 'Photos', symbol: '▣' },
      { id: 'sources', label: 'Sources & Evidence', symbol: '▧', adminOnly: true },
    ] }],
  },
  {
    id: 'operations', label: 'Operations', symbol: '⚒', defaultTab: 'maintenance',
    groups: [{ label: 'Decision Support', tabs: [
      { id: 'maintenance', label: 'Maintenance', symbol: '⚒' },
      { id: 'works', label: 'Ongoing Works', symbol: '▰' },
      { id: 'investment', label: 'Investment Plan', symbol: '↗' },
    ] }],
  },
  { id: 'reports', label: 'Reports', symbol: '▧', defaultTab: 'reports', groups: [] },
  {
    id: 'capture', label: 'Data Capture', symbol: '+', defaultTab: 'capture_surveys', adminOnly: true,
    groups: [{ label: 'Condition Surveys', tabs: [
      { id: 'capture_surveys', label: 'Road Survey', symbol: '+' },
      { id: 'capture_fwd', label: 'FWD Survey', symbol: '⌁' },
    ] }],
  },
  {
    id: 'administration', label: 'Administration', symbol: '⚙', defaultTab: 'data_catalogue', adminOnly: true,
    groups: [{ label: 'PMS Management', tabs: [
      { id: 'data_catalogue', label: 'Data Catalogue', symbol: '▥' },
      { id: 'system_docs', label: 'System Documents', symbol: '▧' },
      { id: 'architecture', label: 'Architecture', symbol: '◇' },
    ] }],
  },
];

const APPS = [
  { name: 'PMS Core', desc: 'National Pavement Registry', symbol: '▦', color: '#3b82f6' },
  { name: 'AI Analytics', desc: 'Defect Detection Hub', symbol: '✦', color: '#ec4899' },
  { name: 'Digital Twin', desc: 'Pavement Layers & LiDAR', symbol: '◇', color: '#10b981' },
  { name: 'Data Capture', desc: 'Field Collection Workspace', symbol: '+', color: '#f59e0b' },
];

function Spinner() { return h('div', { className: 'pms-parity-loading' }, h('span')); }
function Icon({ symbol, size = '' }) { return h('span', { className: `pms-parity-icon ${size}`, 'aria-hidden': 'true' }, symbol); }

class WorkspaceBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return h('section', { className: 'pms-module-error' },
      h(Icon, { symbol: '△', size: 'large' }), h('h2', null, 'Workspace data is unavailable'),
      h('p', null, 'This module could not load its source dataset. The navigation and remaining PMS workspaces are still available.'),
      h('button', { onClick: this.props.onReset }, 'Return to Overview')
    );
  }
}

function PavementMapHub() {
  const [roads, setRoads] = React.useState([]);
  const [query, setQuery] = React.useState('');
  const [surface, setSurface] = React.useState('All');
  const [selected, setSelected] = React.useState(null);
  const [zoom, setZoom] = React.useState(1);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    let active = true;
    fetch('/uganda_npms/road_network.geojson').then((response) => {
      if (!response.ok) throw new Error(`Road network ${response.status}`);
      return response.json();
    }).then((data) => { if (active) setRoads(Array.isArray(data.features) ? data.features : []); })
      .catch(() => { if (active) setError('The national road geometry could not be loaded.'); });
    return () => { active = false; };
  }, []);
  const filtered = React.useMemo(() => roads.filter((feature) => {
    const p = feature.properties || {};
    const matchesSurface = surface === 'All' || p.surface === surface;
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || `${p.link_id || ''} ${p.link_name || ''} ${p.road || ''} ${p.region || ''}`.toLowerCase().includes(needle);
    return matchesSurface && matchesQuery;
  }), [roads, query, surface]);
  const paths = React.useMemo(() => filtered.slice(0, 1800).map((feature, index) => {
    const geometry = feature.geometry || {};
    const lines = geometry.type === 'MultiLineString' ? geometry.coordinates : [geometry.coordinates || []];
    const d = lines.map((line) => line.map((point, pointIndex) => {
      const x = ((Number(point[0]) - 29.4) / 5.8) * 1000;
      const y = 700 - ((Number(point[1]) + 1.6) / 6.1) * 700;
      return `${pointIndex ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ')).join(' ');
    return { feature, d, index };
  }), [filtered]);
  const surfaceColor = (value) => value === 'Bituminous' ? '#38bdf8' : value === 'Unsealed' ? '#f59e0b' : '#94a3b8';
  const selectedProps = selected?.properties || null;
  return h('section', { className: 'pms-map-workspace' },
    h('aside', { className: 'pms-map-sidebar' },
      h('div', { className: 'pms-map-sidebar-title' }, h('span', null, 'PAVEMENT NETWORK'), h('strong', null, `${filtered.length.toLocaleString()} road links`)),
      h('input', { type: 'search', value: query, onChange: (event) => setQuery(event.target.value), placeholder: 'Search road, link or region…', 'aria-label': 'Search pavement links' }),
      h('div', { className: 'pms-surface-filter' }, ['All', 'Bituminous', 'Unsealed'].map((value) => h('button', { key: value, className: surface === value ? 'active' : '', onClick: () => setSurface(value) }, value))),
      h('div', { className: 'pms-road-list' }, filtered.slice(0, 120).map((feature) => {
        const p = feature.properties || {};
        return h('button', { key: p.link_id || p.link_name, className: selected === feature ? 'active' : '', onClick: () => setSelected(feature) },
          h('i', { style: { background: surfaceColor(p.surface) } }), h('span', null, h('strong', null, p.link_name || p.road || 'Road link'), h('small', null, `${p.link_id || '—'} · ${p.region || 'National'}`)), h('b', null, `${Number(p.length_km || 0).toFixed(1)} km`)
        );
      }))
    ),
    h('div', { className: 'pms-map-canvas' },
      h('div', { className: 'pms-map-toolbar' }, h('strong', null, 'National Pavement GIS'), h('span', null, `Road class and surface inventory · ${Math.round(zoom * 100)}%`), h('div', null,
        h('button', { title: 'Zoom in', 'aria-label': 'Zoom in', disabled: zoom >= 2.5, onClick: () => setZoom((value) => Math.min(2.5, value + .25)) }, '+'),
        h('button', { title: 'Zoom out', 'aria-label': 'Zoom out', disabled: zoom <= 1, onClick: () => setZoom((value) => Math.max(1, value - .25)) }, '−'))),
      error ? h('div', { className: 'pms-map-error' }, error) : !roads.length ? h(Spinner) : h('svg', { viewBox: '0 0 1000 700', role: 'img', 'aria-label': 'Uganda national pavement network map', preserveAspectRatio: 'xMidYMid meet' },
        h('rect', { width: 1000, height: 700, fill: '#071222' }),
        h('g', { transform: `translate(${500 * (1 - zoom)} ${350 * (1 - zoom)}) scale(${zoom})` },
          paths.map(({ feature, d, index }) => h('path', { key: feature.properties?.link_id || index, d, fill: 'none', stroke: selected === feature ? '#fff' : surfaceColor(feature.properties?.surface), strokeWidth: (selected === feature ? 3.2 : 1.35) / zoom, opacity: selected && selected !== feature ? .22 : .86, onClick: () => setSelected(feature) }))
        )
      ),
      h('div', { className: 'pms-map-legend' }, h('span', null, h('i', { className: 'bituminous' }), 'Bituminous'), h('span', null, h('i', { className: 'unsealed' }), 'Unsealed / gravel')),
      selectedProps && h('article', { className: 'pms-map-detail' }, h('button', { onClick: () => setSelected(null), 'aria-label': 'Close road details' }, '×'), h('span', null, selectedProps.link_id), h('h3', null, selectedProps.link_name || selectedProps.road), h('dl', null,
        h('div', null, h('dt', null, 'Road'), h('dd', null, selectedProps.road || '—')),
        h('div', null, h('dt', null, 'Surface'), h('dd', null, selectedProps.surface || '—')),
        h('div', null, h('dt', null, 'Region'), h('dd', null, selectedProps.region || '—')),
        h('div', null, h('dt', null, 'Length'), h('dd', null, `${Number(selectedProps.length_km || 0).toFixed(2)} km`))
      ))
    )
  );
}

function OverviewHub({ onNavigate }) {
  const [metrics, setMetrics] = React.useState(null);
  React.useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/uganda_npms/data/network_stats.json').then((response) => response.json()),
      fetch('/uganda_npms/data/network_summary.json').then((response) => response.json()),
      fetch('/uganda_npms/data/image_defects_summary.json').then((response) => response.json()),
      fetch('/uganda_npms/data/maintenance_programme.json').then((response) => response.json()),
    ]).then(([stats, summary, images, maintenance]) => { if (active) setMetrics({ stats, summary, images, maintenance }); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const workspaces = [
    { title: 'Pavement Network', desc: 'Explore the national road-link network and condition on the GIS map.', tab: 'map', symbol: '⌖' },
    { title: 'Inventory & Condition', desc: 'Review registry, asset inventory and historical condition records.', tab: 'registry', symbol: '▤' },
    { title: 'Maintenance', desc: 'Prioritize links and review condition-led maintenance requirements.', tab: 'maintenance', symbol: '⚒' },
    { title: 'Investment Planning', desc: 'Use structural and deterioration analytics to support programming.', tab: 'investment', symbol: '↗' },
    { title: 'Complete Data Library', desc: 'Search and export every published network, survey, traffic and spatial dataset.', tab: 'data_explorer', symbol: '▦' },
  ];
  return h('section', { className: 'pms-overview-hub' },
    h('div', { className: 'pms-overview-title' },
      h('div', null, h('span', { className: 'pms-eyebrow' }, 'NATIONAL PAVEMENT MANAGEMENT SYSTEM'), h('h1', null, 'Pavement Network Overview'), h('p', null, 'Integrated inventory, condition, structural capacity and investment decision support for Uganda’s national road network.')),
      h('button', { onClick: () => onNavigate('map') }, 'Open GIS Map')
    ),
    h('div', { className: 'pms-overview-kpis' },
      h('article', null, h('span', null, 'Road links'), h('strong', null, metrics ? Number(metrics.stats.total_links).toLocaleString() : '1,017'), h('small', null, `${metrics ? Number(metrics.stats.total_km).toLocaleString() : '—'} km registered`)),
      h('article', null, h('span', null, 'Paved network'), h('strong', null, metrics ? `${Number(metrics.stats.paved_pct).toFixed(1)}%` : '—'), h('small', null, `${metrics ? Number(metrics.stats.paved_km).toLocaleString() : '—'} km paved`)),
      h('article', null, h('span', null, 'Condition coverage'), h('strong', null, metrics ? `${Number(metrics.summary.measured_pct).toFixed(1)}%` : '—'), h('small', null, `${metrics ? Number(metrics.summary.measured_links).toLocaleString() : '—'} measured links`)),
      h('article', null, h('span', null, 'Maintenance candidates'), h('strong', null, metrics ? Number(metrics.maintenance.all_links?.length || 0).toLocaleString() : '—'), h('small', null, 'Prioritised programme records'))
    ),
    h('div', { className: 'pms-overview-grid' }, workspaces.map((item) =>
      h('button', { key: item.title, onClick: () => onNavigate(item.tab) }, h(Icon, { symbol: item.symbol, size: 'large' }), h('span', null, h('strong', null, item.title), h('small', null, item.desc)), h('b', null, 'Open →'))
    ))
  );
}

function ReportHub({ onNavigate }) {
  const reports = [
    { title: 'National Pavement Inventory', desc: 'Road-link register, surface type, class and administrative ownership.', tab: 'registry', symbol: '▤' },
    { title: 'Asset Inventory Report', desc: 'Drainage, safety, roadside and pavement asset inventory tables.', tab: 'inventory', symbol: '▥' },
    { title: 'Condition & Deterioration', desc: 'Historical VCI, IRI and pavement-condition trends by survey year.', tab: 'maintenance', symbol: '↘' },
    { title: 'Structural Capacity', desc: 'FWD deflection bowls, structural number and investment indicators.', tab: 'analytics', symbol: '↗' },
  ];
  return h('section', { className: 'pms-report-hub' },
    h('div', { className: 'pms-report-heading' },
      h('div', null, h('span', { className: 'pms-eyebrow' }, 'REPORTING CENTRE'), h('h1', null, 'Pavement Management Reports'), h('p', null, 'Authoritative registry, condition, structural and investment reporting for Uganda’s national road network.')),
      h('button', { onClick: () => window.print() }, 'Print current view')
    ),
    h('div', { className: 'pms-report-summary' },
      h('article', null, h('strong', null, '4'), h('span', null, 'Report families')),
      h('article', null, h('strong', null, 'National'), h('span', null, 'Network coverage')),
      h('article', null, h('strong', null, 'CSV / Print'), h('span', null, 'Export formats'))
    ),
    h('div', { className: 'pms-report-grid' }, reports.map((report) =>
      h('button', { key: report.title, onClick: () => onNavigate(report.tab) },
        h(Icon, { symbol: report.symbol, size: 'large' }),
        h('span', null, h('strong', null, report.title), h('small', null, report.desc)),
        h('b', null, 'Open report →')
      )
    ))
  );
}

const WORKSPACE_CONTENT = {
  photos: ['Survey Photo Library', 'Geotagged pavement imagery grouped by road link, chainage and survey date.', ['Link-based photo search', 'Condition evidence review', 'Survey-year comparison']],
  sources: ['Sources & Evidence', 'Trace the datasets, survey campaigns and evidence used by the pavement registry.', ['Source catalogue', 'Import history', 'Evidence provenance']],
  maintenance: ['Maintenance Programme', 'Prioritise routine and periodic maintenance from condition and network evidence.', ['Treatment candidates', 'Priority ranking', 'Programme monitoring']],
  works: ['Ongoing Works', 'Track active pavement contracts, planned milestones and network-level delivery status.', ['Contract register', 'Progress milestones', 'Road-link impacts']],
  investment: ['Investment Plan', 'Build multi-year pavement programmes from structural, condition and economic indicators.', ['Scenario planning', 'Budget allocation', 'Programme exports']],
  capture_surveys: ['Road Survey Capture', 'Register field survey campaigns and upload link-referenced pavement observations.', ['Survey campaign setup', 'Road-link assignment', 'Quality review']],
  capture_fwd: ['FWD Survey Capture', 'Manage structural-capacity surveys, deflection bowls and validated FWD imports.', ['FWD import', 'Validation status', 'Structural indicators']],
  data_catalogue: ['Data Catalogue', 'Administer the pavement registry datasets, ownership and refresh cycles.', ['Dataset register', 'Stewardship', 'Refresh status']],
  system_docs: ['System Documents', 'Access operating procedures, data dictionaries and platform reference material.', ['User guides', 'Data dictionary', 'Standard procedures']],
  architecture: ['System Architecture', 'Review the NPMS data flow, platform services and integration boundaries.', ['Platform services', 'Data pipelines', 'Integration map']],
};

function WorkspaceHub({ tab }) {
  const [title, description, capabilities] = WORKSPACE_CONTENT[tab];
  return h('section', { className: 'pms-workspace-hub' },
    h('div', { className: 'pms-workspace-heading' }, h('span', { className: 'pms-eyebrow' }, 'PAVEMENT WORKSPACE'), h('h1', null, title), h('p', null, description)),
    h('div', { className: 'pms-workspace-metrics' },
      h('article', null, h('span', null, 'Coverage'), h('strong', null, 'National Network'), h('small', null, 'Road-link referenced')),
      h('article', null, h('span', null, 'Workspace'), h('strong', null, 'Operational'), h('small', null, 'Role-controlled access')),
      h('article', null, h('span', null, 'Evidence'), h('strong', null, 'Traceable'), h('small', null, 'Registry-backed records'))
    ),
    h('div', { className: 'pms-capability-grid' }, capabilities.map((capability, index) => h('article', { key: capability }, h(Icon, { symbol: ['▤', '⌁', '✓'][index], size: 'large' }), h('strong', null, capability), h('small', null, 'Available in the national pavement management workspace.'))))
  );
}

function moduleFor(tab, setTab) {
  switch (tab) {
    case 'overview': return h(OverviewHub, { onNavigate: setTab });
    case 'map': return h(PavementMapHub);
    case 'registry': return h(PMSDataExplorer, { mode: 'network', initialFile: 'network_links.json', title: 'National Link Registry', description: 'Every published road link with class, chainage, surface, maintenance ownership and programme status.' });
    case 'inventory': return h(PMSDataExplorer, { mode: 'network', initialFile: 'road_inventory_2023.json', title: 'Road Asset Inventory', description: 'Detailed pavement, shoulder, drainage, roadside and point-feature inventory records.' });
    case 'digital_twin': return h(PMSDataExplorer, { mode: 'network', initialFile: 'central_network_db.json', title: 'Network Digital Twin Data', description: 'The integrated road-link database supporting spatial, condition and programme views.' });
    case 'critical': return h(PMSDataExplorer, { mode: 'operations', initialFile: 'maintenance_programme.json', title: 'Critical Links & Priorities', description: 'Network-wide intervention priorities ranked from condition, deterioration and cost evidence.' });
    case 'analytics': return h(PMSDataExplorer, { mode: 'condition', initialFile: 'cross_section_analytics.json', title: 'Pavement Analytics', description: 'Condition, ROMDAS and deterioration-model outputs across the national network.' });
    case 'data_explorer': return h(PMSDataExplorer, { mode: 'catalogue', initialFile: 'network_links.json', title: 'Complete NPMS Data Explorer', description: 'All published NPMS network, condition, operations, traffic, structures, evidence and spatial data in one searchable workspace.' });
    case 'photos': return h(PMSDataExplorer, { mode: 'evidence', initialFile: 'pavement_images.json', title: 'Survey Photo Library', description: 'Geotagged pavement imagery, AI defect classifications and evidence manifests.' });
    case 'sources': return h(PMSDataExplorer, { mode: 'catalogue', initialFile: 'photo_manifest.json', title: 'Sources & Evidence', description: 'Complete source catalogue with traceable survey, imagery and published repository records.' });
    case 'maintenance': return h(PMSDataExplorer, { mode: 'operations', initialFile: 'maintenance_programme.json', title: 'Maintenance Programme', description: 'All 1,017 road-link maintenance candidates with intervention, priority and cost data.' });
    case 'works': return h(PMSDataExplorer, { mode: 'operations', initialFile: 'oprc_ndpiv.json', title: 'Ongoing Works', description: 'OPRC lots, NDP IV projects, annual workplans and active bridge works.' });
    case 'investment': return h(PMSDataExplorer, { mode: 'operations', initialFile: 'annual_workplans.json', title: 'Investment Plan', description: 'Multi-year workplans, budgets and prioritised investment programmes.' });
    case 'capture_surveys': return h(PMSDataExplorer, { mode: 'network', initialFile: 'road_inventory_2023.json', title: 'Road Survey Records', description: 'Published road-inventory survey coverage and detailed asset observations.' });
    case 'capture_fwd': return h(PMSDataExplorer, { mode: 'evidence', initialFile: 'fwd_surveys.json', title: 'FWD Survey Records', description: 'Structural-capacity survey runs, deflection bowls and source workbooks.' });
    case 'data_catalogue': return h(PMSDataExplorer, { mode: 'catalogue', initialFile: 'network_stats.json', title: 'NPMS Data Catalogue', description: 'Every published data asset, its record coverage, fields and exportable source rows.' });
    case 'system_docs': return h(PMSDataExplorer, { mode: 'platform', initialFile: 'comprehensive_schema.json', title: 'System Documents & Schemas', description: 'Platform definitions, data dictionaries and machine-readable documentation.' });
    case 'architecture': return h(PMSDataExplorer, { mode: 'platform', initialFile: 'platform_schema.json', title: 'Platform Architecture', description: 'Published table topology, data bundle and integration schema.' });
    case 'reports': return h(ReportHub, { onNavigate: setTab });
    default: return h(Overview);
  }
}

function PMSWorkspaceParity() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [activeTab, setActiveTab] = React.useState('overview');
  const [launcherOpen, setLauncherOpen] = React.useState(false);
  const sections = React.useMemo(() => SECTIONS
    .filter((section) => isAdmin || !section.adminOnly)
    .map((section) => ({ ...section, groups: section.groups.map((group) => ({
      ...group, tabs: group.tabs.filter((tab) => isAdmin || !tab.adminOnly),
    })).filter((group) => group.tabs.length) })), [isAdmin]);
  const activeSection = sections.find((section) => section.defaultTab === activeTab
    || section.groups.some((group) => group.tabs.some((tab) => tab.id === activeTab))) || sections[0];
  const showSubnav = activeSection.groups.flatMap((group) => group.tabs).length > 1;
  const isDataTab = !['overview', 'map', 'reports'].includes(activeTab);
  const openSection = (section) => { setActiveTab(section.defaultTab); setLauncherOpen(false); };

  return h('div', { className: 'pms-parity-shell' },
    h('div', { className: 'pms-parity-ambient' }),
    h('div', { className: 'pms-parity-nav-wrapper' },
      h('nav', { className: 'pms-parity-nav', 'aria-label': 'Main sections' },
        h('div', { className: 'pms-parity-brand', title: 'MoWT PMS National Pavement Registry' },
          h('img', { src: '/uganda_npms/mowt.jpg', alt: 'MoWT Logo' }),
          h('div', null, h('strong', null, 'MoWT PMS'), h('span', null, 'National Pavement Registry'))
        ),
        h('div', { className: 'pms-parity-main-links' }, sections.map((section) =>
          h('button', { key: section.id, className: activeSection.id === section.id ? 'active' : '', onClick: () => openSection(section) }, h(Icon, { symbol: section.symbol }), h('span', null, section.label))
        )),
        h('div', { className: 'pms-parity-nav-right' },
          h('button', { className: `pms-app-button ${launcherOpen ? 'active' : ''}`, title: 'MoWT Enterprise Applications', onClick: () => setLauncherOpen(!launcherOpen) }, h(Icon, { symbol: '▦' })),
          launcherOpen && h('div', { className: 'pms-app-launcher' },
            h('h4', null, 'Enterprise Applications'),
            APPS.map((app) => h('button', { key: app.name, onClick: () => setLauncherOpen(false) }, h('i', { style: { color: app.color, background: `${app.color}20` } }, app.symbol), h('strong', null, app.name), h('span', null, app.desc)))
          ),
          h('div', { className: 'pms-auth-badge', title: isAdmin ? 'Full Access' : 'Dashboard Access' }, h(Icon, { symbol: isAdmin ? '◆' : '●' }), h('span', null, isAdmin ? 'Admin' : 'Dashboard User')),
          h('button', { className: 'pms-logout', onClick: logout, title: 'Logout' }, h(Icon, { symbol: '↪' }), h('span', null, 'Logout'))
        )
      ),
      showSubnav && h('nav', { className: 'pms-context-subnav', 'aria-label': `${activeSection.label} tabs` },
        h('div', { className: 'pms-context-title' }, h(Icon, { symbol: activeSection.symbol }), h('span', null, activeSection.label)),
        h('div', { className: 'pms-context-scroll' }, activeSection.groups.map((group, groupIndex) =>
          h('div', { className: 'pms-context-group', key: group.label },
            groupIndex > 0 && h('span', { className: 'pms-context-divider' }),
            h('span', { className: 'pms-context-label' }, group.label),
            group.tabs.map((tab) => h('button', { key: tab.id, className: activeTab === tab.id ? 'active' : '', onClick: () => setActiveTab(tab.id) }, h(Icon, { symbol: tab.symbol }), h('span', null, tab.label)))
          )
        ))
      )
    ),
    h('main', { className: `pms-parity-content ${activeTab === 'map' ? 'map-mode' : ''} ${isDataTab ? 'data-mode' : ''}` },
      h(WorkspaceBoundary, { resetKey: activeTab, onReset: () => setActiveTab('overview') },
        h(React.Suspense, { fallback: h(Spinner) }, moduleFor(activeTab, setActiveTab))
      )
    )
  );
}

export const P = Object.freeze({ default: PMSWorkspaceParity });
export default PMSWorkspaceParity;
