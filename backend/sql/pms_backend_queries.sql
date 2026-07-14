-- Named query: link_current_state
SELECT * FROM pms_v_current_link_state
WHERE (:region IS NULL OR maintenance_region = :region)
  AND (:surface IS NULL OR surface_type = :surface)
ORDER BY link_id;

-- Named query: link_timeseries
SELECT o.link_id, o.survey_date, o.survey_year, o.iri_m_per_km,
       o.rut_depth_mm, o.vci, o.pci, o.cracking_percent,
       o.condition_class, f.relative_path AS source_file
FROM pms_condition_observations o
JOIN pms_source_files f ON f.source_id=o.source_id
WHERE o.link_id=:link_id
ORDER BY COALESCE(o.survey_date, printf('%04d-12-31', o.survey_year));

-- Named query: asset_crosslink
SELECT l.link_id, l.link_name, l.maintenance_region,
       a.asset_type, a.asset_subtype, COUNT(*) AS asset_count,
       AVG(a.quantity) AS average_quantity,
       AVG(a.length_m) AS average_length_m,
       GROUP_CONCAT(DISTINCT a.condition_class) AS observed_conditions
FROM pms_road_links l
JOIN pms_inventory_assets a ON a.link_id=l.link_id
WHERE (:asset_type IS NULL OR a.asset_type=:asset_type)
GROUP BY l.link_id, a.asset_type, a.asset_subtype
ORDER BY asset_count DESC;

-- Named query: variable_lineage
SELECT * FROM pms_v_variable_lineage ORDER BY category, canonical_name;

-- Named query: source_coverage
SELECT * FROM pms_v_source_coverage ORDER BY repository_group, extension;

-- Named query: model_value_audit
SELECT c.link_id, d.canonical_name, c.value_numeric, c.value_text,
       c.reporting_at, c.observed_at, c.value_method, c.confidence,
       s.relative_path AS source_file, m.model_name, m.model_version
FROM pms_current_values c
JOIN pms_variable_definitions d ON d.variable_id=c.variable_id
LEFT JOIN pms_source_files s ON s.source_id=c.source_id
LEFT JOIN pms_model_runs m ON m.model_run_id=c.model_run_id
WHERE c.link_id=:link_id
ORDER BY d.category, d.canonical_name;

