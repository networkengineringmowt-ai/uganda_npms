from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

import joblib
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .config import Settings, settings


NUMERIC_FEATURES = ("current_iri", "rut_depth_mm", "cracking_percent", "pavement_age_years", "length_km", "aadt", "years_ahead")
CATEGORICAL_FEATURES = ("surface_type", "maintenance_region")
FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
TARGET = "target_iri"


@dataclass(frozen=True)
class ModelMetadata:
    model_version: str
    training_rows: int
    metrics: dict[str, float]
    trained_at: str


class PavementDeteriorationModel:
    def __init__(self, cfg: Settings = settings) -> None:
        self.cfg = cfg
        self.pipeline: Pipeline | None = None
        self.metadata: ModelMetadata | None = None

    @staticmethod
    def _matrix(rows: Sequence[dict[str, Any]]) -> np.ndarray:
        return np.asarray([[row.get(name, 0 if name in NUMERIC_FEATURES else "Unknown") for name in FEATURES] for row in rows], dtype=object)

    def train(self, rows: Sequence[dict[str, Any]]) -> ModelMetadata:
        if len(rows) < self.cfg.min_training_rows:
            raise ValueError(f"At least {self.cfg.min_training_rows} training rows are required; received {len(rows)}")
        x = self._matrix(rows)
        y = np.asarray([float(row[TARGET]) for row in rows], dtype=float)
        numeric_indexes = list(range(len(NUMERIC_FEATURES)))
        categorical_indexes = list(range(len(NUMERIC_FEATURES), len(FEATURES)))
        self.pipeline = Pipeline([
            ("features", ColumnTransformer([
                ("numeric", StandardScaler(), numeric_indexes),
                ("categorical", OneHotEncoder(handle_unknown="ignore", sparse_output=False), categorical_indexes),
            ])),
            ("model", RandomForestRegressor(
                n_estimators=240, min_samples_leaf=2, max_features=0.8,
                random_state=self.cfg.random_seed, n_jobs=-1,
            )),
        ])
        self.pipeline.fit(x, y)
        fitted = self.pipeline.predict(x)
        metrics = {
            "mae": round(float(mean_absolute_error(y, fitted)), 6),
            "r2": round(float(r2_score(y, fitted)), 6),
            "rmse": round(float(np.sqrt(np.mean((y - fitted) ** 2))), 6),
        }
        digest = hashlib.sha256(json.dumps(metrics, sort_keys=True).encode()).hexdigest()[:12]
        self.metadata = ModelMetadata(
            model_version=f"rf-iri-{digest}", training_rows=len(rows), metrics=metrics,
            trained_at=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        )
        return self.metadata

    def predict(self, row: dict[str, Any]) -> float:
        if self.pipeline is None:
            raise RuntimeError("Model is not trained or loaded")
        return float(np.clip(self.pipeline.predict(self._matrix([row]))[0], 0, 30))

    def save(self, path: Path | None = None) -> Path:
        if self.pipeline is None or self.metadata is None:
            raise RuntimeError("Cannot save an untrained model")
        target = (path or self.cfg.model_path).resolve()
        target.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({"pipeline": self.pipeline, "metadata": self.metadata}, target)
        return target

    @classmethod
    def load(cls, path: Path | None = None, cfg: Settings = settings) -> "PavementDeteriorationModel":
        target = (path or cfg.model_path).resolve()
        payload = joblib.load(target)
        instance = cls(cfg)
        instance.pipeline = payload["pipeline"]
        instance.metadata = payload["metadata"]
        return instance


def refresh_training_rows(conn: sqlite3.Connection) -> int:
    conn.execute("DELETE FROM pms_ml_training_rows")
    conn.execute("""
        INSERT INTO pms_ml_training_rows(
          link_id, current_iri, rut_depth_mm, cracking_percent, pavement_age_years,
          length_km, aadt, years_ahead, surface_type, maintenance_region, target_iri,
          source_observation_id, target_observation_id
        )
        SELECT link_id,current_iri,rut_depth_mm,cracking_percent,pavement_age_years,
               length_km,aadt,years_ahead,surface_type,maintenance_region,target_iri,
               source_observation_id,target_observation_id
        FROM pms_v_ml_training_pairs
        WHERE target_iri BETWEEN 0 AND 30 AND years_ahead > 0
    """)
    conn.commit()
    return int(conn.execute("SELECT COUNT(*) FROM pms_ml_training_rows").fetchone()[0])


def training_rows(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    return [dict(row) for row in conn.execute("SELECT * FROM pms_ml_training_rows ORDER BY training_row_id")]


def register_model_run(conn: sqlite3.Connection, metadata: ModelMetadata, cfg: Settings = settings) -> int:
    cursor = conn.execute(
        """INSERT INTO pms_model_runs(
           model_name,model_version,algorithm,feature_variables_json,target_variables_json,
           hyperparameters_json,training_rows,validation_metrics_json,trained_at,reporting_at,
           artifact_path,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            "Uganda Pavement Deterioration Model", metadata.model_version, "Random forest regression",
            json.dumps(FEATURES), json.dumps([TARGET]),
            json.dumps({"estimators": 240, "seed": cfg.random_seed, "min_samples_leaf": 2}),
            metadata.training_rows, json.dumps(metadata.metrics), metadata.trained_at,
            f"{cfg.reporting_year}-12-31", str(cfg.model_path), "complete",
        ),
    )
    conn.commit()
    return int(cursor.lastrowid)
