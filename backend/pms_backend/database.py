from __future__ import annotations

import math
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import Settings, settings


def clamp(value: float | None, lower: float, upper: float) -> float | None:
    if value is None:
        return None
    return max(lower, min(upper, float(value)))


def condition_band(iri: float | None, cfg: Settings = settings) -> str:
    if iri is None or not math.isfinite(float(iri)):
        return "Unknown"
    value = float(iri)
    if value < cfg.iri_good_upper:
        return "Good"
    if value < cfg.iri_fair_upper:
        return "Fair"
    if value < cfg.iri_poor_upper:
        return "Poor"
    return "Very Poor"


def intervention(iri: float | None, rut_mm: float | None, cracking: float | None, surface: str | None, cfg: Settings = settings) -> str:
    value = float(iri or 0)
    rut = float(rut_mm or 0)
    crack = float(cracking or 0)
    if "gravel" in str(surface or "").lower() or "unpaved" in str(surface or "").lower():
        return "Reconstruct (Gravel)" if value >= cfg.iri_poor_upper else "Regravelling" if value >= cfg.iri_fair_upper else "Routine Maintenance"
    if value >= cfg.iri_poor_upper or rut >= 20 or crack >= 25:
        return "Reconstruct"
    if value >= cfg.iri_fair_upper or rut >= 12 or crack >= 15:
        return "Overlay"
    if value >= cfg.iri_good_upper or crack >= 5:
        return "Reseal"
    return "Routine Maintenance"


def confidence(observed_year: int | None, target_year: int | None, base: float | None, cfg: Settings = settings) -> float:
    start = int(observed_year or cfg.reporting_year)
    end = int(target_year or cfg.reporting_year)
    initial = clamp(float(base if base is not None else 0.85), 0, 1) or 0
    return round(max(0.05, initial * ((1 - cfg.confidence_decay) ** max(0, end - start))), 6)


def deteriorated_iri(iri: float | None, years: int | None, surface: str | None, cfg: Settings = settings) -> float | None:
    if iri is None:
        return None
    rate = cfg.gravel_iri_growth if "gravel" in str(surface or "").lower() or "unpaved" in str(surface or "").lower() else cfg.annual_iri_growth
    return round(float(clamp(float(iri) + max(0, int(years or 0)) * rate, 0, 30)), 6)


def priority_score(iri: float | None, rut_mm: float | None, cracking: float | None, aadt: float | None) -> float:
    iri_score = min(40, max(0, float(iri or 0) / 12 * 40))
    rut_score = min(20, max(0, float(rut_mm or 0) / 30 * 20))
    crack_score = min(20, max(0, float(cracking or 0) / 40 * 20))
    traffic_score = min(20, max(0, math.log10(max(1, float(aadt or 1))) / 5 * 20))
    return round(iri_score + rut_score + crack_score + traffic_score, 4)


def register_functions(conn: sqlite3.Connection, cfg: Settings = settings) -> None:
    conn.create_function("pms_clamp", 3, clamp, deterministic=True)
    conn.create_function("pms_condition_band", 1, lambda iri: condition_band(iri, cfg), deterministic=True)
    conn.create_function("pms_intervention", 4, lambda iri, rut, crack, surface: intervention(iri, rut, crack, surface, cfg), deterministic=True)
    conn.create_function("pms_confidence", 3, lambda observed, target, base: confidence(observed, target, base, cfg), deterministic=True)
    conn.create_function("pms_deteriorated_iri", 3, lambda iri, years, surface: deteriorated_iri(iri, years, surface, cfg), deterministic=True)
    conn.create_function("pms_priority_score", 4, priority_score, deterministic=True)


def connect(path: Path | None = None, cfg: Settings = settings) -> sqlite3.Connection:
    db_path = (path or cfg.database_path).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    register_functions(conn, cfg)
    return conn


def migrate(conn: sqlite3.Connection, cfg: Settings = settings) -> None:
    cfg.validate()
    conn.executescript(cfg.schema_path.read_text(encoding="utf-8"))
    conn.executescript(cfg.variables_path.read_text(encoding="utf-8"))
    conn.executescript(cfg.functions_path.read_text(encoding="utf-8"))
    conn.commit()


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
