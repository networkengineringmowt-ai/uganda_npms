-- SQLite analytical functions are registered by pms_backend.database.register_functions:
--   pms_clamp(value, lower, upper)
--   pms_condition_band(iri)
--   pms_intervention(iri, rut_mm, cracking_percent, surface_type)
--   pms_confidence(observed_year, target_year, base_confidence)
--   pms_deteriorated_iri(iri, years_ahead, surface_type)
--   pms_priority_score(iri, rut_mm, cracking_percent, aadt)

DROP VIEW IF EXISTS pms_v_ml_training_pairs;
CREATE VIEW pms_v_ml_training_pairs AS
WITH ordered AS (
  SELECT
    o.*,
    LEAD(o.observation_id) OVER link_window AS target_observation_id,
    LEAD(o.iri_m_per_km) OVER link_window AS target_iri,
    LEAD(COALESCE(o.survey_year, CAST(substr(o.survey_date,1,4) AS INTEGER))) OVER link_window AS target_year
  FROM pms_condition_observations o
  WHERE o.link_id IS NOT NULL AND o.iri_m_per_km IS NOT NULL
  WINDOW link_window AS (
    PARTITION BY o.link_id
    ORDER BY COALESCE(o.survey_year, CAST(substr(o.survey_date,1,4) AS INTEGER)), o.observation_id
  )
), traffic AS (
  SELECT link_id, MAX(CASE WHEN d.canonical_name='aadt' THEN c.value_numeric END) AS aadt
  FROM pms_current_values c
  JOIN pms_variable_definitions d ON d.variable_id=c.variable_id
  GROUP BY link_id
)
SELECT
  o.link_id,
  o.iri_m_per_km AS current_iri,
  COALESCE(o.rut_depth_mm,0) AS rut_depth_mm,
  COALESCE(o.cracking_percent,0) AS cracking_percent,
  COALESCE(l.pavement_age_years,0) AS pavement_age_years,
  COALESCE(l.length_km,1) AS length_km,
  COALESCE(t.aadt,0) AS aadt,
  o.target_year - COALESCE(o.survey_year, CAST(substr(o.survey_date,1,4) AS INTEGER)) AS years_ahead,
  COALESCE(l.surface_type,'Unknown') AS surface_type,
  COALESCE(l.maintenance_region,'Unknown') AS maintenance_region,
  o.target_iri,
  o.observation_id AS source_observation_id,
  o.target_observation_id
FROM ordered o
JOIN pms_road_links l ON l.link_id=o.link_id
LEFT JOIN traffic t ON t.link_id=o.link_id
WHERE o.target_observation_id IS NOT NULL;

DROP VIEW IF EXISTS pms_v_link_decisions;
CREATE VIEW pms_v_link_decisions AS
SELECT
  s.*,
  pms_condition_band(s.current_iri) AS calculated_condition_class,
  pms_intervention(s.current_iri,s.current_rut_mm,s.current_cracking_percent,s.surface_type) AS recommended_intervention,
  pms_priority_score(s.current_iri,s.current_rut_mm,s.current_cracking_percent,0) AS priority_score
FROM pms_v_current_link_state s;

DROP VIEW IF EXISTS pms_v_network_kpis;
CREATE VIEW pms_v_network_kpis AS
SELECT
  COUNT(*) AS link_count,
  ROUND(SUM(COALESCE(length_km,0)),2) AS network_length_km,
  ROUND(AVG(current_iri),3) AS average_iri,
  SUM(CASE WHEN pms_condition_band(current_iri)='Good' THEN 1 ELSE 0 END) AS good_links,
  SUM(CASE WHEN pms_condition_band(current_iri)='Fair' THEN 1 ELSE 0 END) AS fair_links,
  SUM(CASE WHEN pms_condition_band(current_iri)='Poor' THEN 1 ELSE 0 END) AS poor_links,
  SUM(CASE WHEN pms_condition_band(current_iri)='Very Poor' THEN 1 ELSE 0 END) AS very_poor_links,
  ROUND(AVG(minimum_confidence),4) AS average_confidence,
  MAX(reporting_at) AS reporting_at
FROM pms_v_current_link_state;

DROP TRIGGER IF EXISTS pms_validate_current_value_insert;
CREATE TRIGGER pms_validate_current_value_insert
BEFORE INSERT ON pms_current_values
BEGIN
  SELECT CASE
    WHEN NEW.confidence < 0 OR NEW.confidence > 1
    THEN RAISE(ABORT,'confidence must be between 0 and 1')
  END;
  SELECT CASE
    WHEN NEW.value_numeric IS NOT NULL AND EXISTS (
      SELECT 1 FROM pms_variable_definitions d
      WHERE d.variable_id=NEW.variable_id
        AND ((d.valid_min IS NOT NULL AND NEW.value_numeric < d.valid_min)
          OR (d.valid_max IS NOT NULL AND NEW.value_numeric > d.valid_max))
    ) THEN RAISE(ABORT,'numeric current value is outside the canonical variable range')
  END;
END;

DROP TRIGGER IF EXISTS pms_validate_current_value_update;
CREATE TRIGGER pms_validate_current_value_update
BEFORE UPDATE OF value_numeric,confidence ON pms_current_values
BEGIN
  SELECT CASE
    WHEN NEW.confidence < 0 OR NEW.confidence > 1
    THEN RAISE(ABORT,'confidence must be between 0 and 1')
  END;
  SELECT CASE
    WHEN NEW.value_numeric IS NOT NULL AND EXISTS (
      SELECT 1 FROM pms_variable_definitions d
      WHERE d.variable_id=NEW.variable_id
        AND ((d.valid_min IS NOT NULL AND NEW.value_numeric < d.valid_min)
          OR (d.valid_max IS NOT NULL AND NEW.value_numeric > d.valid_max))
    ) THEN RAISE(ABORT,'numeric current value is outside the canonical variable range')
  END;
END;
