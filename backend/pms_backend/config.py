from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
DEPLOY_ROOT = BACKEND_DIR.parent
REPOSITORY_ROOT = DEPLOY_ROOT.parent


def _path(name: str, default: Path) -> Path:
    value = os.getenv(name)
    return Path(value).expanduser().resolve() if value else default.resolve()


def _float(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


def _int(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("NPMS_APP_NAME", "Uganda NPMS Backend")
    environment: str = os.getenv("NPMS_ENVIRONMENT", "development")
    host: str = os.getenv("NPMS_HOST", "127.0.0.1")
    port: int = _int("NPMS_PORT", 8000)
    log_level: str = os.getenv("NPMS_LOG_LEVEL", "INFO")
    database_path: Path = _path("PMS_DB_PATH", DEPLOY_ROOT / "data" / "npms_backend.db")
    model_path: Path = _path("PMS_MODEL_PATH", BACKEND_DIR / "artifacts" / "pavement_model.joblib")
    schema_path: Path = _path("PMS_SCHEMA_PATH", BACKEND_DIR / "sql" / "pms_backend_schema.sql")
    functions_path: Path = _path("PMS_FUNCTIONS_PATH", BACKEND_DIR / "sql" / "pms_functions.sql")
    reporting_year: int = _int("PMS_REPORTING_YEAR", 2026)
    iri_good_upper: float = _float("PMS_IRI_GOOD_UPPER", 3.5)
    iri_fair_upper: float = _float("PMS_IRI_FAIR_UPPER", 6.5)
    iri_poor_upper: float = _float("PMS_IRI_POOR_UPPER", 9.0)
    annual_iri_growth: float = _float("PMS_ANNUAL_IRI_GROWTH", 0.18)
    gravel_iri_growth: float = _float("PMS_GRAVEL_IRI_GROWTH", 0.32)
    confidence_decay: float = _float("PMS_CONFIDENCE_DECAY", 0.08)
    random_seed: int = _int("PMS_RANDOM_SEED", 42)
    min_training_rows: int = _int("PMS_MIN_TRAINING_ROWS", 20)
    max_api_rows: int = _int("PMS_MAX_API_ROWS", 2000)
    admin_key: str | None = os.getenv("PMS_ADMIN_KEY")

    def validate(self) -> None:
        if not (0 < self.iri_good_upper < self.iri_fair_upper < self.iri_poor_upper):
            raise ValueError("IRI thresholds must be positive and strictly increasing")
        if not 0 <= self.confidence_decay <= 1:
            raise ValueError("PMS_CONFIDENCE_DECAY must be between 0 and 1")
        if not 1 <= self.port <= 65535:
            raise ValueError("NPMS_PORT must be between 1 and 65535")


settings = Settings()
