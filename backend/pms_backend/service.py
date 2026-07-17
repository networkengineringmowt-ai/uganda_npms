from __future__ import annotations

from pathlib import Path

from .config import Settings, settings
from .database import condition_band, confidence, deteriorated_iri, intervention, priority_score
from .ml import PavementDeteriorationModel
from .schemas import PredictionInput, PredictionOutput


class PredictionService:
    def __init__(self, cfg: Settings = settings) -> None:
        self.cfg = cfg
        self.model: PavementDeteriorationModel | None = None
        if Path(cfg.model_path).exists():
            self.model = PavementDeteriorationModel.load(cfg=cfg)

    def predict(self, request: PredictionInput) -> PredictionOutput:
        years_ahead = max(0, request.target_year - request.observed_year)
        features = {
            "current_iri": request.current_iri,
            "rut_depth_mm": request.rut_depth_mm,
            "cracking_percent": request.cracking_percent,
            "pavement_age_years": request.pavement_age_years,
            "length_km": request.length_km,
            "aadt": request.aadt,
            "years_ahead": years_ahead,
            "surface_type": request.surface_type,
            "maintenance_region": request.maintenance_region,
        }
        if self.model:
            predicted = self.model.predict(features)
            method = "machine_learning"
            version = self.model.metadata.model_version if self.model.metadata else None
        else:
            predicted = deteriorated_iri(request.current_iri, years_ahead, request.surface_type, self.cfg) or 0
            method = "deterministic_fallback"
            version = None
        return PredictionOutput(
            link_id=request.link_id,
            target_year=request.target_year,
            predicted_iri=round(predicted, 4),
            condition_class=condition_band(predicted, self.cfg),
            intervention_type=intervention(predicted, request.rut_depth_mm, request.cracking_percent, request.surface_type, self.cfg),
            priority_score=priority_score(predicted, request.rut_depth_mm, request.cracking_percent, request.aadt),
            confidence=confidence(request.observed_year, request.target_year, request.base_confidence, self.cfg),
            method=method,
            model_version=version,
        )
