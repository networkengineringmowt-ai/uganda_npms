from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class VariableDefinition:
    name: str
    category: str
    data_type: str
    unit: str | None
    description: str
    valid_min: float | None
    valid_max: float | None
    aggregation: str
    current_method: str


VARIABLE_DEFINITIONS = (
    VariableDefinition("iri_m_per_km", "condition", "REAL", "m/km", "International Roughness Index", 0, 30, "weighted mean", "observed or ML projected"),
    VariableDefinition("rut_depth_mm", "condition", "REAL", "mm", "Mean wheel-path rut depth", 0, 100, "weighted mean", "observed or ML projected"),
    VariableDefinition("vci", "condition", "REAL", "index", "Visual Condition Index", 0, 100, "weighted mean", "observed or ML projected"),
    VariableDefinition("pci", "condition", "REAL", "index", "Pavement Condition Index", 0, 100, "weighted mean", "observed or ML projected"),
    VariableDefinition("cracking_percent", "condition", "REAL", "%", "Cracked pavement area", 0, 100, "weighted mean", "observed or ML projected"),
    VariableDefinition("potholes_value", "condition", "REAL", "count/km", "Normalized pothole density", 0, None, "mean", "latest observation"),
    VariableDefinition("condition_class", "condition", "TEXT", None, "IRI-derived condition band", None, None, "classification", "pms_condition_band SQL function"),
    VariableDefinition("length_km", "inventory", "REAL", "km", "Gazetted link length", 0, None, "sum", "latest network register"),
    VariableDefinition("pavement_age_years", "inventory", "REAL", "years", "Age since construction or rehabilitation", 0, 200, "latest", "reporting year minus intervention year"),
    VariableDefinition("surface_type", "inventory", "TEXT", None, "Paved or unpaved surface classification", None, None, "latest", "latest network register"),
    VariableDefinition("aadt", "traffic", "REAL", "vehicles/day", "Annual average daily traffic", 0, None, "latest", "traffic station cross-link"),
    VariableDefinition("heavy_vehicle_percent", "traffic", "REAL", "%", "Heavy vehicle share", 0, 100, "weighted mean", "traffic station cross-link"),
    VariableDefinition("rainfall_mm_year", "climate", "REAL", "mm/year", "Annual rainfall exposure", 0, 6000, "mean", "regional climate cross-link"),
    VariableDefinition("predicted_iri", "model_output", "REAL", "m/km", "Forecast IRI at target year", 0, 30, "prediction", "ML model or deterministic fallback"),
    VariableDefinition("prediction_confidence", "model_output", "REAL", "ratio", "Prediction confidence", 0, 1, "minimum", "age-decayed model confidence"),
    VariableDefinition("intervention_type", "decision", "TEXT", None, "Recommended maintenance intervention", None, None, "classification", "pms_intervention SQL function"),
    VariableDefinition("priority_score", "decision", "REAL", "score", "Network intervention priority score", 0, 100, "maximum", "pms_priority_score SQL function"),
)


ENGINE_SETTINGS = {
    "iri_good_upper": (3.5, None, "m/km", "Upper IRI bound for Good condition"),
    "iri_fair_upper": (6.5, None, "m/km", "Upper IRI bound for Fair condition"),
    "iri_poor_upper": (9.0, None, "m/km", "Upper IRI bound for Poor condition"),
    "reporting_date": (None, "2026-12-31", "date", "Current reporting date"),
    "ml_hidden_layers": (None, "128,96,64,32", "neurons", "MLP hidden layer topology"),
    "ml_max_iterations": (1200, None, "iterations", "Maximum MLP training iterations"),
    "ml_random_seed": (42, None, "seed", "Reproducible model seed"),
    "ml_validation_fraction": (0.2, None, "ratio", "Held-out validation fraction"),
    "source_hash_max_mb": (2048, None, "MB", "Largest source file eligible for SHA-256"),
}


ENGINE_VARIABLE_ROWS = [
    (v.name, v.category, v.data_type, v.unit, v.description, v.valid_min, v.valid_max, v.aggregation, v.current_method)
    for v in VARIABLE_DEFINITIONS
]
