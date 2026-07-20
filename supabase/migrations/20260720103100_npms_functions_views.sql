begin;

insert into public.pms_engine_settings(setting_key,value_numeric,value_text,unit,description) values
('iri_good_upper',3.5,null,'m/km','Upper IRI bound for Good condition'),
('iri_fair_upper',6.5,null,'m/km','Upper IRI bound for Fair condition'),
('iri_poor_upper',9.0,null,'m/km','Upper IRI bound for Poor condition'),
('reporting_date',null,'2026-12-31','date','Current reporting date'),
('annual_iri_growth',0.18,null,'m/km/year','Annual paved-road IRI growth'),
('gravel_iri_growth',0.32,null,'m/km/year','Annual gravel-road IRI growth'),
('confidence_decay',0.08,null,'ratio/year','Annual forecast confidence decay'),
('intervention_rut_reconstruct',20,null,'mm','Rut threshold for reconstruction'),
('intervention_rut_overlay',12,null,'mm','Rut threshold for overlay'),
('intervention_crack_reconstruct',25,null,'%','Cracking threshold for reconstruction'),
('intervention_crack_overlay',15,null,'%','Cracking threshold for overlay'),
('intervention_crack_reseal',5,null,'%','Cracking threshold for resealing'),
('priority_iri_max',12,null,'m/km','IRI normalization maximum'),
('priority_rut_max',30,null,'mm','Rut normalization maximum'),
('priority_crack_max',40,null,'%','Cracking normalization maximum'),
('priority_traffic_log_max',5,null,'log10','Traffic normalization maximum'),
('priority_iri_weight',40,null,'score','IRI priority weight'),
('priority_rut_weight',20,null,'score','Rut priority weight'),
('priority_crack_weight',20,null,'score','Cracking priority weight'),
('priority_traffic_weight',20,null,'score','Traffic priority weight'),
('ml_hidden_layers',null,'128,96,64,32','neurons','MLP hidden layer topology'),
('ml_max_iterations',1200,null,'iterations','Maximum MLP training iterations'),
('ml_random_seed',42,null,'seed','Reproducible model seed'),
('ml_validation_fraction',0.2,null,'ratio','Held-out validation fraction'),
('source_hash_max_mb',2048,null,'MB','Largest source file eligible for SHA-256')
on conflict(setting_key) do update set
value_numeric=excluded.value_numeric,value_text=excluded.value_text,unit=excluded.unit,
description=excluded.description,updated_at=now();

insert into public.pms_ingestion_formats
(repository_group,extension,parser_name,content_signature,ingestion_mode,description) values
('fwd','.f25','dynatest_f25','','structured','Dynatest F25 structural measurement file'),
('fwd','.fwd','kuab_fwd','','structured','KUAB FWD structural measurement file'),
('fwd','.txt','kuab_fwd','fwd file','signature','KUAB FWD text export'),
('fwd','.gpx','gpx','','spatial','GPS route or track file'),
('fwd','.zip','zip_catalog','','catalog','ZIP archive entry inventory'),
('fwd','.csv','csv','','tabular','Delimited tabular source'),
('fwd','.xlsx','excel','','tabular','Excel workbook metadata and recognized rows'),
('fwd','.pdf','document','','document','Searchable PDF document'),
('fwd','.docx','document','','document','Searchable Word document'),
('fwd','.mdb','access','','tabular','Microsoft Access table and field metadata'),
('fwd','.accdb','access','','tabular','Microsoft Access table and field metadata')
on conflict(repository_group,extension,content_signature) do update set
parser_name=excluded.parser_name,ingestion_mode=excluded.ingestion_mode,description=excluded.description;

create or replace function public.pms_setting(p_key text)
returns double precision language plpgsql stable as $$
declare result double precision;
begin
  select value_numeric into result from public.pms_engine_settings where setting_key=p_key;
  if result is null then raise exception 'Missing numeric PMS setting: %', p_key; end if;
  return result;
end $$;

create or replace function public.pms_clamp(p_value double precision,p_lower double precision,p_upper double precision)
returns double precision language sql immutable as $$
  select case when p_value is null then null else greatest(p_lower,least(p_upper,p_value)) end
$$;

create or replace function public.pms_condition_band(p_iri double precision)
returns text language sql stable as $$
  select case
    when p_iri is null then 'Unknown'
    when p_iri < public.pms_setting('iri_good_upper') then 'Good'
    when p_iri < public.pms_setting('iri_fair_upper') then 'Fair'
    when p_iri < public.pms_setting('iri_poor_upper') then 'Poor'
    else 'Very Poor' end
$$;

create or replace function public.pms_intervention(
  p_iri double precision,p_rut double precision,p_crack double precision,p_surface text
) returns text language sql stable as $$
  select case
    when lower(coalesce(p_surface,'')) ~ '(gravel|unpaved)' then
      case when coalesce(p_iri,0) >= public.pms_setting('iri_poor_upper') then 'Reconstruct (Gravel)'
           when coalesce(p_iri,0) >= public.pms_setting('iri_fair_upper') then 'Regravelling'
           else 'Routine Maintenance' end
    when coalesce(p_iri,0) >= public.pms_setting('iri_poor_upper')
      or coalesce(p_rut,0) >= public.pms_setting('intervention_rut_reconstruct')
      or coalesce(p_crack,0) >= public.pms_setting('intervention_crack_reconstruct') then 'Reconstruct'
    when coalesce(p_iri,0) >= public.pms_setting('iri_fair_upper')
      or coalesce(p_rut,0) >= public.pms_setting('intervention_rut_overlay')
      or coalesce(p_crack,0) >= public.pms_setting('intervention_crack_overlay') then 'Overlay'
    when coalesce(p_iri,0) >= public.pms_setting('iri_good_upper')
      or coalesce(p_crack,0) >= public.pms_setting('intervention_crack_reseal') then 'Reseal'
    else 'Routine Maintenance' end
$$;

create or replace function public.pms_confidence(
  p_observed_year integer,p_target_year integer,p_base double precision
) returns double precision language sql stable as $$
  select round(greatest(0.05,public.pms_clamp(coalesce(p_base,0.85),0,1) *
    power(1-public.pms_setting('confidence_decay'),greatest(0,coalesce(p_target_year,p_observed_year)-coalesce(p_observed_year,p_target_year))))::numeric,6)::double precision
$$;

create or replace function public.pms_deteriorated_iri(
  p_iri double precision,p_years integer,p_surface text
) returns double precision language sql stable as $$
  select case when p_iri is null then null else round(public.pms_clamp(
    p_iri + greatest(0,coalesce(p_years,0)) * case when lower(coalesce(p_surface,'')) ~ '(gravel|unpaved)'
      then public.pms_setting('gravel_iri_growth') else public.pms_setting('annual_iri_growth') end,0,30)::numeric,6)::double precision end
$$;

create or replace function public.pms_priority_score(
  p_iri double precision,p_rut double precision,p_crack double precision,p_aadt double precision
) returns double precision language sql stable as $$
  select round((
    least(public.pms_setting('priority_iri_weight'),greatest(0,coalesce(p_iri,0)/public.pms_setting('priority_iri_max')*public.pms_setting('priority_iri_weight'))) +
    least(public.pms_setting('priority_rut_weight'),greatest(0,coalesce(p_rut,0)/public.pms_setting('priority_rut_max')*public.pms_setting('priority_rut_weight'))) +
    least(public.pms_setting('priority_crack_weight'),greatest(0,coalesce(p_crack,0)/public.pms_setting('priority_crack_max')*public.pms_setting('priority_crack_weight'))) +
    least(public.pms_setting('priority_traffic_weight'),greatest(0,log(greatest(1,coalesce(p_aadt,1)))/public.pms_setting('priority_traffic_log_max')*public.pms_setting('priority_traffic_weight')))
  )::numeric,4)::double precision
$$;

create or replace view public.pms_v_latest_observed_condition as
with ranked as (
  select o.*,row_number() over(partition by o.link_id order by coalesce(o.survey_date,make_date(o.survey_year,12,31)) desc,o.observation_id desc) rn
  from public.pms_condition_observations o where o.link_id is not null
) select * from ranked where rn=1;

create or replace view public.pms_v_current_link_state as
select l.link_id,l.road_no,l.road_class,l.link_name,l.length_km,l.surface_type,l.maintenance_station,l.maintenance_region,l.pavement_age_years,
max(case when d.canonical_name='iri_m_per_km' then c.value_numeric end) current_iri,
max(case when d.canonical_name='rut_depth_mm' then c.value_numeric end) current_rut_mm,
max(case when d.canonical_name='vci' then c.value_numeric end) current_vci,
max(case when d.canonical_name='pci' then c.value_numeric end) current_pci,
max(case when d.canonical_name='cracking_percent' then c.value_numeric end) current_cracking_percent,
max(case when d.canonical_name='condition_class' then c.value_text end) condition_class,
min(c.confidence) minimum_confidence,string_agg(distinct c.value_method,',') value_methods,max(c.reporting_at) reporting_at
from public.pms_road_links l left join public.pms_current_values c on c.link_id=l.link_id
left join public.pms_variable_definitions d on d.variable_id=c.variable_id group by l.link_id;

create or replace view public.pms_v_source_coverage as
select repository_group,extension,count(*) file_count,sum(byte_size) total_bytes,sum(record_count) registered_records,
count(*) filter(where ingestion_status='complete') complete_files,count(*) filter(where ingestion_status='error') error_files
from public.pms_source_files group by repository_group,extension;

create or replace view public.pms_v_fwd_survey_summary as
select s.fwd_survey_id,s.source_id,s.project_name,s.road_name,s.road_code,s.operator_name,s.lane,s.survey_date,s.file_format,
s.start_chainage_km,s.end_chainage_km,count(distinct t.fwd_test_id) test_count,count(d.sensor_index) deflection_count,
round(avg(t.load_kn)::numeric,3) average_load_kn,round(avg(d.deflection_microns) filter(where d.sensor_index=0)::numeric,3) average_d0_microns,
min(t.station_km) observed_start_chainage_km,max(t.station_km) observed_end_chainage_km
from public.pms_fwd_surveys s left join public.pms_fwd_tests t on t.fwd_survey_id=s.fwd_survey_id
left join public.pms_fwd_deflections d on d.fwd_test_id=t.fwd_test_id group by s.fwd_survey_id;

create or replace view public.pms_v_fwd_test_measurements as
select t.*,coalesce((select jsonb_object_agg(d.sensor_index::text,d.deflection_microns) from public.pms_fwd_deflections d where d.fwd_test_id=t.fwd_test_id),'{}'::jsonb) deflections_json,
coalesce((select jsonb_object_agg(d.sensor_index::text,d.sensor_offset_mm) from public.pms_fwd_deflections d where d.fwd_test_id=t.fwd_test_id),'{}'::jsonb) sensor_offsets_mm_json
from public.pms_fwd_tests t;

create or replace view public.pms_v_variable_lineage as
select d.canonical_name,d.category,d.unit,d.current_value_method,count(distinct f.source_table_id) source_table_count,
count(distinct c.link_id) current_link_count,avg(c.confidence) average_confidence
from public.pms_variable_definitions d left join public.pms_source_fields f on f.canonical_name=d.canonical_name
left join public.pms_current_values c on c.variable_id=d.variable_id group by d.variable_id;

create or replace view public.pms_v_ml_training_pairs as
with ordered as (
 select o.*,lead(o.observation_id) over w target_observation_id,lead(o.iri_m_per_km) over w target_iri,
 lead(coalesce(o.survey_year,extract(year from o.survey_date)::integer)) over w target_year
 from public.pms_condition_observations o where o.link_id is not null and o.iri_m_per_km is not null
 window w as(partition by o.link_id order by coalesce(o.survey_year,extract(year from o.survey_date)::integer),o.observation_id)
), traffic as (
 select c.link_id,max(case when d.canonical_name='aadt' then c.value_numeric end) aadt
 from public.pms_current_values c join public.pms_variable_definitions d on d.variable_id=c.variable_id group by c.link_id
)
select o.link_id,o.iri_m_per_km current_iri,coalesce(o.rut_depth_mm,0) rut_depth_mm,coalesce(o.cracking_percent,0) cracking_percent,
coalesce(l.pavement_age_years,0) pavement_age_years,coalesce(l.length_km,1) length_km,coalesce(t.aadt,0) aadt,
o.target_year-coalesce(o.survey_year,extract(year from o.survey_date)::integer) years_ahead,coalesce(l.surface_type,'Unknown') surface_type,
coalesce(l.maintenance_region,'Unknown') maintenance_region,o.target_iri,o.observation_id source_observation_id,o.target_observation_id
from ordered o join public.pms_road_links l on l.link_id=o.link_id left join traffic t on t.link_id=o.link_id where o.target_observation_id is not null;

create or replace view public.pms_v_link_decisions as
select s.*,public.pms_condition_band(s.current_iri) calculated_condition_class,
public.pms_intervention(s.current_iri,s.current_rut_mm,s.current_cracking_percent,s.surface_type) recommended_intervention,
public.pms_priority_score(s.current_iri,s.current_rut_mm,s.current_cracking_percent,0) priority_score
from public.pms_v_current_link_state s;

create or replace view public.pms_v_network_kpis as
select count(*) link_count,round(sum(coalesce(length_km,0))::numeric,2) network_length_km,round(avg(current_iri)::numeric,3) average_iri,
count(*) filter(where public.pms_condition_band(current_iri)='Good') good_links,
count(*) filter(where public.pms_condition_band(current_iri)='Fair') fair_links,
count(*) filter(where public.pms_condition_band(current_iri)='Poor') poor_links,
count(*) filter(where public.pms_condition_band(current_iri)='Very Poor') very_poor_links,
round(avg(minimum_confidence)::numeric,4) average_confidence,max(reporting_at) reporting_at from public.pms_v_current_link_state;

create or replace function public.pms_validate_current_value() returns trigger language plpgsql as $$
declare definition public.pms_variable_definitions%rowtype;
begin
  select * into definition from public.pms_variable_definitions where variable_id=new.variable_id;
  if new.value_numeric is not null and ((definition.valid_min is not null and new.value_numeric < definition.valid_min)
    or (definition.valid_max is not null and new.value_numeric > definition.valid_max)) then
    raise exception 'numeric current value is outside the canonical variable range';
  end if;
  return new;
end $$;

drop trigger if exists pms_validate_current_value_change on public.pms_current_values;
create trigger pms_validate_current_value_change before insert or update of value_numeric,confidence
on public.pms_current_values for each row execute function public.pms_validate_current_value();

do $$
declare table_name text;
declare has_authenticated boolean := exists(select 1 from pg_roles where rolname='authenticated');
declare has_service_role boolean := exists(select 1 from pg_roles where rolname='service_role');
begin
  foreach table_name in array array[
    'pms_engine_settings','pms_source_files','pms_source_tables','pms_variable_definitions','pms_source_fields',
    'pms_manual_documents','pms_road_links','pms_condition_observations','pms_inventory_assets','pms_model_runs',
    'pms_current_values','pms_predictions','pms_infographics','pms_parser_variables','pms_ingestion_formats',
    'pms_fwd_surveys','pms_fwd_tests','pms_fwd_deflections','pms_source_gps_points','pms_archive_entries',
    'pms_ml_training_rows','pms_prediction_requests'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    if has_authenticated then
      execute format('drop policy if exists pms_authenticated_read on public.%I',table_name);
      execute format('create policy pms_authenticated_read on public.%I for select to authenticated using (true)',table_name);
      execute format('grant select on public.%I to authenticated',table_name);
    end if;
    if has_service_role then execute format('grant all on public.%I to service_role',table_name); end if;
  end loop;
end $$;

do $$
begin
  if exists(select 1 from pg_roles where rolname='authenticated') then
    grant execute on function public.pms_condition_band(double precision) to authenticated;
    grant execute on function public.pms_intervention(double precision,double precision,double precision,text) to authenticated;
    grant execute on function public.pms_confidence(integer,integer,double precision) to authenticated;
    grant execute on function public.pms_deteriorated_iri(double precision,integer,text) to authenticated;
    grant execute on function public.pms_priority_score(double precision,double precision,double precision,double precision) to authenticated;
  end if;
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.pms_condition_band(double precision) to service_role;
    grant execute on function public.pms_intervention(double precision,double precision,double precision,text) to service_role;
    grant execute on function public.pms_confidence(integer,integer,double precision) to service_role;
    grant execute on function public.pms_deteriorated_iri(double precision,integer,text) to service_role;
    grant execute on function public.pms_priority_score(double precision,double precision,double precision,double precision) to service_role;
  end if;
end $$;

commit;
