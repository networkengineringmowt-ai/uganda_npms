from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from pms_backend.config import Settings
from pms_backend.ml import PavementDeteriorationModel


def training_sample(index: int) -> dict:
    current = 2.0 + (index % 20) * 0.35
    years = 1 + index % 5
    gravel = index % 3 == 0
    return {
        "current_iri": current,
        "rut_depth_mm": 3 + index % 18,
        "cracking_percent": 2 + index % 25,
        "pavement_age_years": 1 + index % 30,
        "length_km": 2 + index % 40,
        "aadt": 500 + index * 170,
        "years_ahead": years,
        "surface_type": "Gravel" if gravel else "Paved",
        "maintenance_region": ["Central", "Eastern", "Northern", "Western"][index % 4],
        "target_iri": min(30, current + years * (0.32 if gravel else 0.18) + (index % 4) * 0.02),
    }


class ModelTests(unittest.TestCase):
    def test_train_save_load_and_predict(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            cfg = Settings(model_path=Path(temp) / "model.joblib", min_training_rows=20)
            rows = [training_sample(i) for i in range(80)]
            model = PavementDeteriorationModel(cfg)
            metadata = model.train(rows)
            self.assertEqual(metadata.training_rows, 80)
            self.assertGreater(metadata.metrics["r2"], 0.8)
            model.save()
            loaded = PavementDeteriorationModel.load(cfg=cfg)
            prediction = loaded.predict(rows[10])
            self.assertGreaterEqual(prediction, 0)
            self.assertLessEqual(prediction, 30)

    def test_rejects_small_training_set(self) -> None:
        cfg = Settings(min_training_rows=20)
        with self.assertRaises(ValueError):
            PavementDeteriorationModel(cfg).train([training_sample(i) for i in range(5)])


if __name__ == "__main__":
    unittest.main()
