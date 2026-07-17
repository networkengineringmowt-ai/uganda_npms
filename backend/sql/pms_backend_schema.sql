PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS pms_engine_settings (
  setting_key TEXT PRIMARY KEY,
  value_numeric REAL,
  value_text TEXT,
  unit TEXT,
  description TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pms_source_files (
  source_id INTEGER PRIMARY KEY AUTOINCREMENT,
  repository_group TEXT NOT NULL,
  absolute_path TEXT NOT NULL UNIQUE,
  relative_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  modified_at TEXT NOT NULL,
  content_sha256 TEXT,
  ingestion_status TEXT NOT NULL DEFAULT 'registered',
  record_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ingested_at TEXT
);

CREATE TABLE IF NOT EXISTS pms_source_tables (
  source_table_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES pms_source_files(source_id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  table_kind TEXT NOT NULL,
  header_row INTEGER,
  row_count INTEGER NOT NULL DEFAULT 0,
  column_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(source_id, table_name)
);

CREATE TABLE IF NOT EXISTS pms_variable_definitions (
  variable_id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  data_type TEXT NOT NULL,
  unit TEXT,
  description TEXT NOT NULL,
  valid_min REAL,
  valid_max REAL,
  aggregation_method TEXT,
  current_value_method TEXT NOT NULL,
  definition_source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pms_source_fields (
  source_field_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_table_id INTEGER NOT NULL REFERENCES pms_source_tables(source_table_id) ON DELETE CASCADE,
  ordinal_position INTEGER NOT NULL,
  source_name TEXT NOT NULL,
  canonical_name TEXT,
  inferred_type TEXT,
  unit TEXT,
  non_null_count INTEGER,
  UNIQUE(source_table_id, ordinal_position)
);

CREATE TABLE IF NOT EXISTS pms_manual_documents (
  manual_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL UNIQUE REFERENCES pms_source_files(source_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL,
  page_count INTEGER,
  extracted_character_count INTEGER NOT NULL DEFAULT 0,
  searchable_text TEXT,
  indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pms_road_links (
  link_id TEXT PRIMARY KEY,
  road_no TEXT,
  road_class TEXT,
  link_name TEXT,
  chainage_from_km REAL,
  chainage_to_km REAL,
  length_km REAL,
  surface_type TEXT,
  maintenance_station TEXT,
  maintenance_region TEXT,
  completion_year INTEGER,
  rehabilitation_year INTEGER,
  pavement_age_years REAL,
  source_id INTEGER REFERENCES pms_source_files(source_id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pms_condition_observations (
  observation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES pms_source_files(source_id),
  source_table_id INTEGER REFERENCES pms_source_tables(source_table_id),
  source_row_number INTEGER,
  link_id TEXT REFERENCES pms_road_links(link_id),
  survey_date TEXT,
  survey_year INTEGER,
  chainage_from_km REAL,
  chainage_to_km REAL,
  iri_m_per_km REAL,
  rut_depth_mm REAL,
  vci REAL,
  pci REAL,
  cracking_percent REAL,
  potholes_value REAL,
  condition_class TEXT,
  data_quality TEXT NOT NULL DEFAULT 'source',
  raw_values_json TEXT,
  UNIQUE(source_id, source_table_id, source_row_number)
);

CREATE TABLE IF NOT EXISTS pms_inventory_assets (
  inventory_asset_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES pms_source_files(source_id),
  source_table_id INTEGER REFERENCES pms_source_tables(source_table_id),
  source_row_number INTEGER,
  external_id TEXT,
  link_id TEXT REFERENCES pms_road_links(link_id),
  asset_type TEXT NOT NULL,
  asset_subtype TEXT,
  chainage_from_km REAL,
  chainage_to_km REAL,
  longitude REAL,
  latitude REAL,
  quantity REAL,
  length_m REAL,
  width_m REAL,
  condition_class TEXT,
  survey_date TEXT,
  raw_values_json TEXT,
  UNIQUE(source_id, source_table_id, source_row_number)
);

CREATE TABLE IF NOT EXISTS pms_model_runs (
  model_run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  feature_variables_json TEXT NOT NULL,
  target_variables_json TEXT NOT NULL,
  hyperparameters_json TEXT NOT NULL,
  training_rows INTEGER NOT NULL,
  validation_metrics_json TEXT NOT NULL,
  trained_at TEXT NOT NULL,
  reporting_at TEXT NOT NULL,
  artifact_path TEXT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pms_current_values (
  link_id TEXT NOT NULL REFERENCES pms_road_links(link_id) ON DELETE CASCADE,
  variable_id INTEGER NOT NULL REFERENCES pms_variable_definitions(variable_id),
  value_numeric REAL,
  value_text TEXT,
  reporting_at TEXT NOT NULL,
  observed_at TEXT,
  value_method TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  source_id INTEGER REFERENCES pms_source_files(source_id),
  model_run_id INTEGER REFERENCES pms_model_runs(model_run_id),
  PRIMARY KEY(link_id, variable_id)
);

CREATE TABLE IF NOT EXISTS pms_predictions (
  prediction_id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id TEXT NOT NULL REFERENCES pms_road_links(link_id) ON DELETE CASCADE,
  model_run_id INTEGER NOT NULL REFERENCES pms_model_runs(model_run_id),
  prediction_year INTEGER NOT NULL,
  iri_m_per_km REAL,
  condition_class TEXT,
  intervention_type TEXT,
  intervention_year INTEGER,
  confidence REAL NOT NULL,
  UNIQUE(link_id, model_run_id, prediction_year)
);

CREATE TABLE IF NOT EXISTS pms_infographics (
  infographic_id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  visualization_type TEXT NOT NULL,
  unit TEXT,
  payload_json TEXT NOT NULL,
  sql_query_name TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pms_ml_training_rows (
  training_row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id TEXT NOT NULL REFERENCES pms_road_links(link_id) ON DELETE CASCADE,
  current_iri REAL NOT NULL CHECK(current_iri BETWEEN 0 AND 30),
  rut_depth_mm REAL NOT NULL DEFAULT 0 CHECK(rut_depth_mm BETWEEN 0 AND 100),
  cracking_percent REAL NOT NULL DEFAULT 0 CHECK(cracking_percent BETWEEN 0 AND 100),
  pavement_age_years REAL NOT NULL DEFAULT 0 CHECK(pavement_age_years BETWEEN 0 AND 200),
  length_km REAL NOT NULL DEFAULT 1 CHECK(length_km > 0),
  aadt REAL NOT NULL DEFAULT 0 CHECK(aadt >= 0),
  years_ahead INTEGER NOT NULL CHECK(years_ahead > 0),
  surface_type TEXT NOT NULL DEFAULT 'Unknown',
  maintenance_region TEXT NOT NULL DEFAULT 'Unknown',
  target_iri REAL NOT NULL CHECK(target_iri BETWEEN 0 AND 30),
  source_observation_id INTEGER REFERENCES pms_condition_observations(observation_id),
  target_observation_id INTEGER REFERENCES pms_condition_observations(observation_id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_observation_id, target_observation_id)
);

CREATE TABLE IF NOT EXISTS pms_prediction_requests (
  request_id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id TEXT NOT NULL,
  target_year INTEGER NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT NOT NULL,
  model_version TEXT,
  requested_by TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pms_sources_group ON pms_source_files(repository_group, extension);
CREATE INDEX IF NOT EXISTS idx_pms_source_fields_name ON pms_source_fields(canonical_name);
CREATE INDEX IF NOT EXISTS idx_pms_condition_link_year ON pms_condition_observations(link_id, survey_year);
CREATE INDEX IF NOT EXISTS idx_pms_inventory_link_type ON pms_inventory_assets(link_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_pms_current_variable ON pms_current_values(variable_id, value_method);
CREATE INDEX IF NOT EXISTS idx_pms_training_link ON pms_ml_training_rows(link_id, years_ahead);
CREATE INDEX IF NOT EXISTS idx_pms_prediction_request_link ON pms_prediction_requests(link_id, target_year);

CREATE VIEW IF NOT EXISTS pms_v_latest_observed_condition AS
WITH ranked AS (
  SELECT o.*,
         ROW_NUMBER() OVER (
           PARTITION BY o.link_id
           ORDER BY COALESCE(o.survey_date, printf('%04d-12-31', o.survey_year)) DESC,
                    o.observation_id DESC
         ) AS rn
  FROM pms_condition_observations o
  WHERE o.link_id IS NOT NULL
)
SELECT * FROM ranked WHERE rn = 1;

CREATE VIEW IF NOT EXISTS pms_v_current_link_state AS
SELECT l.link_id, l.road_no, l.road_class, l.link_name, l.length_km,
       l.surface_type, l.maintenance_station, l.maintenance_region,
       l.pavement_age_years,
       MAX(CASE WHEN d.canonical_name='iri_m_per_km' THEN c.value_numeric END) AS current_iri,
       MAX(CASE WHEN d.canonical_name='rut_depth_mm' THEN c.value_numeric END) AS current_rut_mm,
       MAX(CASE WHEN d.canonical_name='vci' THEN c.value_numeric END) AS current_vci,
       MAX(CASE WHEN d.canonical_name='pci' THEN c.value_numeric END) AS current_pci,
       MAX(CASE WHEN d.canonical_name='cracking_percent' THEN c.value_numeric END) AS current_cracking_percent,
       MAX(CASE WHEN d.canonical_name='condition_class' THEN c.value_text END) AS condition_class,
       MIN(c.confidence) AS minimum_confidence,
       GROUP_CONCAT(DISTINCT c.value_method) AS value_methods,
       MAX(c.reporting_at) AS reporting_at
FROM pms_road_links l
LEFT JOIN pms_current_values c ON c.link_id=l.link_id
LEFT JOIN pms_variable_definitions d ON d.variable_id=c.variable_id
GROUP BY l.link_id;

CREATE VIEW IF NOT EXISTS pms_v_source_coverage AS
SELECT repository_group, extension, COUNT(*) AS file_count,
       SUM(byte_size) AS total_bytes, SUM(record_count) AS registered_records,
       SUM(CASE WHEN ingestion_status='complete' THEN 1 ELSE 0 END) AS complete_files,
       SUM(CASE WHEN ingestion_status='error' THEN 1 ELSE 0 END) AS error_files
FROM pms_source_files
GROUP BY repository_group, extension;

CREATE VIEW IF NOT EXISTS pms_v_variable_lineage AS
SELECT d.canonical_name, d.category, d.unit, d.current_value_method,
       COUNT(DISTINCT f.source_table_id) AS source_table_count,
       COUNT(DISTINCT c.link_id) AS current_link_count,
       AVG(c.confidence) AS average_confidence
FROM pms_variable_definitions d
LEFT JOIN pms_source_fields f ON f.canonical_name=d.canonical_name
LEFT JOIN pms_current_values c ON c.variable_id=d.variable_id
GROUP BY d.variable_id;

