from __future__ import annotations

from pydantic import BaseModel, Field


class PredictionInput(BaseModel):
    link_id: str = Field(min_length=1, max_length=80)
    current_iri: float = Field(ge=0, le=30)
    rut_depth_mm: float = Field(default=0, ge=0, le=100)
    cracking_percent: float = Field(default=0, ge=0, le=100)
    pavement_age_years: float = Field(default=0, ge=0, le=200)
    length_km: float = Field(default=1, gt=0, le=1000)
    aadt: float = Field(default=0, ge=0)
    surface_type: str = Field(default="Paved", max_length=80)
    maintenance_region: str = Field(default="Unknown", max_length=80)
    observed_year: int = Field(ge=1990, le=2100)
    target_year: int = Field(ge=1990, le=2100)
    base_confidence: float = Field(default=0.85, ge=0, le=1)


class PredictionOutput(BaseModel):
    link_id: str
    target_year: int
    predicted_iri: float
    condition_class: str
    intervention_type: str
    priority_score: float
    confidence: float
    method: str
    model_version: str | None = None


class SqlEvaluationInput(BaseModel):
    iri: float | None = Field(default=None, ge=0, le=30)
    rut_depth_mm: float | None = Field(default=None, ge=0, le=100)
    cracking_percent: float | None = Field(default=None, ge=0, le=100)
    aadt: float | None = Field(default=0, ge=0)
    surface_type: str = "Paved"
    observed_year: int | None = None
    target_year: int | None = None
    base_confidence: float = Field(default=0.85, ge=0, le=1)
