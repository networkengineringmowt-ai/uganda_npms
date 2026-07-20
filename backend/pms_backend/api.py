from __future__ import annotations

import json

from fastapi import Depends, FastAPI, Header, HTTPException, Query

from . import __version__
from .config import settings
from .database import connect, migrate
from .schemas import PredictionInput, PredictionOutput, SqlEvaluationInput
from .schema_catalog import schema_catalog
from .service import PredictionService


settings.validate()
app = FastAPI(title=settings.app_name, version=__version__, docs_url="/docs", redoc_url="/redoc")


def database():
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def require_admin(x_admin_key: str | None = Header(default=None)) -> None:
    if settings.admin_key and x_admin_key != settings.admin_key:
        raise HTTPException(status_code=403, detail="Invalid X-Admin-Key")


@app.on_event("startup")
def startup() -> None:
    conn = connect()
    try:
        migrate(conn)
    finally:
        conn.close()


@app.get("/health")
def health() -> dict:
    conn = connect()
    try:
        conn.execute("SELECT 1").fetchone()
        model = conn.execute("SELECT model_version,status,trained_at FROM pms_model_runs ORDER BY model_run_id DESC LIMIT 1").fetchone()
        return {"status": "ok", "version": __version__, "database": str(settings.database_path), "model": dict(model) if model else None}
    finally:
        conn.close()


@app.get("/api/variables")
def variables(conn=Depends(database)) -> dict:
    return {"variables": [dict(row) for row in conn.execute("SELECT * FROM pms_variable_definitions ORDER BY category,canonical_name")]}


@app.get("/api/settings")
def engine_settings(conn=Depends(database), _=Depends(require_admin)) -> dict:
    return {"settings": [dict(row) for row in conn.execute("SELECT * FROM pms_engine_settings ORDER BY setting_key")]}


@app.get("/api/schema")
def sql_schema(conn=Depends(database)) -> dict:
    return schema_catalog(conn)


@app.get("/api/links")
def links(
    region: str | None = None,
    surface: str | None = None,
    limit: int = Query(default=250, ge=1),
    offset: int = Query(default=0, ge=0),
    conn=Depends(database),
) -> dict:
    size = min(limit, settings.max_api_rows)
    rows = conn.execute(
        """SELECT * FROM pms_v_current_link_state
           WHERE (? IS NULL OR maintenance_region=?) AND (? IS NULL OR surface_type=?)
           ORDER BY link_id LIMIT ? OFFSET ?""",
        (region, region, surface, surface, size, offset),
    ).fetchall()
    return {"count": len(rows), "limit": size, "offset": offset, "rows": [dict(row) for row in rows]}


@app.get("/api/links/{link_id}")
def link(link_id: str, conn=Depends(database)) -> dict:
    row = conn.execute("SELECT * FROM pms_v_link_decisions WHERE link_id=?", (link_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Unknown link {link_id}")
    observations = conn.execute(
        "SELECT * FROM pms_condition_observations WHERE link_id=? ORDER BY survey_year,survey_date", (link_id,),
    ).fetchall()
    return {"link": dict(row), "observations": [dict(item) for item in observations]}


@app.get("/api/fwd/summary")
def fwd_summary(conn=Depends(database)) -> dict:
    totals = conn.execute(
        """SELECT COUNT(DISTINCT s.fwd_survey_id) AS surveys,
                  COUNT(DISTINCT t.fwd_test_id) AS tests,
                  COUNT(d.sensor_index) AS deflections,
                  COUNT(DISTINCT CASE WHEN t.latitude IS NOT NULL AND t.longitude IS NOT NULL THEN t.fwd_test_id END) AS georeferenced_tests,
                  MIN(s.survey_date) AS earliest_survey,
                  MAX(s.survey_date) AS latest_survey
           FROM pms_fwd_surveys s
           LEFT JOIN pms_fwd_tests t ON t.fwd_survey_id=s.fwd_survey_id
           LEFT JOIN pms_fwd_deflections d ON d.fwd_test_id=t.fwd_test_id"""
    ).fetchone()
    formats = conn.execute(
        "SELECT file_format,COUNT(*) AS surveys FROM pms_fwd_surveys GROUP BY file_format ORDER BY surveys DESC"
    ).fetchall()
    return {"totals": dict(totals), "formats": [dict(row) for row in formats]}


@app.get("/api/fwd/surveys")
def fwd_surveys(
    road: str | None = None,
    limit: int = Query(default=250, ge=1),
    offset: int = Query(default=0, ge=0),
    conn=Depends(database),
) -> dict:
    size = min(limit, settings.max_api_rows)
    rows = conn.execute(
        """SELECT * FROM pms_v_fwd_survey_summary
           WHERE (? IS NULL OR project_name LIKE '%' || ? || '%' OR road_name LIKE '%' || ? || '%' OR road_code LIKE '%' || ? || '%')
           ORDER BY survey_date DESC,project_name LIMIT ? OFFSET ?""",
        (road, road, road, road, size, offset),
    ).fetchall()
    return {"count": len(rows), "limit": size, "offset": offset, "rows": [dict(row) for row in rows]}


@app.get("/api/fwd/surveys/{survey_id}/tests")
def fwd_tests(
    survey_id: int,
    limit: int = Query(default=500, ge=1),
    offset: int = Query(default=0, ge=0),
    conn=Depends(database),
) -> dict:
    survey = conn.execute("SELECT * FROM pms_fwd_surveys WHERE fwd_survey_id=?", (survey_id,)).fetchone()
    if not survey:
        raise HTTPException(status_code=404, detail=f"Unknown FWD survey {survey_id}")
    size = min(limit, settings.max_api_rows)
    rows = conn.execute(
        """SELECT * FROM pms_v_fwd_test_measurements
           WHERE fwd_survey_id=?
           ORDER BY station_km,source_row_number LIMIT ? OFFSET ?""",
        (survey_id, size, offset),
    ).fetchall()
    measurements = []
    for row in rows:
        item = dict(row)
        item["deflections"] = json.loads(item.pop("deflections_json"))
        item["sensor_offsets_mm"] = json.loads(item.pop("sensor_offsets_mm_json"))
        measurements.append(item)
    return {"survey": dict(survey), "count": len(rows), "limit": size, "offset": offset, "rows": measurements}


@app.post("/api/ml/predict", response_model=PredictionOutput)
def predict(request: PredictionInput) -> PredictionOutput:
    if request.target_year < request.observed_year:
        raise HTTPException(status_code=422, detail="target_year must be on or after observed_year")
    return PredictionService().predict(request)


@app.get("/api/ml/model")
def model(conn=Depends(database)) -> dict:
    row = conn.execute("SELECT * FROM pms_model_runs ORDER BY model_run_id DESC LIMIT 1").fetchone()
    return {"model": dict(row) if row else None, "artifact_exists": settings.model_path.exists()}


@app.post("/api/sql/evaluate")
def evaluate(payload: SqlEvaluationInput, conn=Depends(database)) -> dict:
    row = conn.execute(
        """SELECT pms_condition_band(?) AS condition_class,
                  pms_intervention(?,?,?,?) AS intervention_type,
                  pms_priority_score(?,?,?,?) AS priority_score,
                  pms_confidence(?,?,?) AS confidence""",
        (
            payload.iri, payload.iri, payload.rut_depth_mm, payload.cracking_percent, payload.surface_type,
            payload.iri, payload.rut_depth_mm, payload.cracking_percent, payload.aadt,
            payload.observed_year, payload.target_year, payload.base_confidence,
        ),
    ).fetchone()
    return dict(row)
