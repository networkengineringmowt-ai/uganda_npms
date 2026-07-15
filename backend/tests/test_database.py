from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from pms_backend.config import Settings
from pms_backend.database import connect, migrate


class DatabaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        backend = Path(__file__).resolve().parents[1]
        self.cfg = Settings(
            database_path=Path(self.temp.name) / "test.db",
            model_path=Path(self.temp.name) / "model.joblib",
            schema_path=backend / "sql" / "pms_backend_schema.sql",
            functions_path=backend / "sql" / "pms_functions.sql",
        )
        self.conn = connect(self.cfg.database_path, self.cfg)
        migrate(self.conn, self.cfg)

    def tearDown(self) -> None:
        self.conn.close()
        self.temp.cleanup()

    def test_schema_variables_and_views_are_created(self) -> None:
        variables = self.conn.execute("SELECT COUNT(*) FROM pms_variable_definitions").fetchone()[0]
        views = {row[0] for row in self.conn.execute("SELECT name FROM sqlite_master WHERE type='view'")}
        self.assertGreaterEqual(variables, 17)
        self.assertIn("pms_v_link_decisions", views)
        self.assertIn("pms_v_ml_training_pairs", views)

    def test_registered_sql_functions(self) -> None:
        row = self.conn.execute(
            """SELECT pms_condition_band(7.2), pms_intervention(7.2,14,18,'Paved'),
                      pms_deteriorated_iri(4.0,5,'Paved'), pms_confidence(2024,2026,0.9),
                      pms_priority_score(8,15,20,10000)"""
        ).fetchone()
        self.assertEqual(row[0], "Poor")
        self.assertEqual(row[1], "Overlay")
        self.assertAlmostEqual(row[2], 4.9)
        self.assertGreater(row[3], 0.7)
        self.assertGreater(row[4], 50)

    def test_value_range_trigger_rejects_invalid_data(self) -> None:
        self.conn.execute("INSERT INTO pms_road_links(link_id) VALUES('A001_Link01')")
        variable_id = self.conn.execute("SELECT variable_id FROM pms_variable_definitions WHERE canonical_name='iri_m_per_km'").fetchone()[0]
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute(
                """INSERT INTO pms_current_values(link_id,variable_id,value_numeric,reporting_at,value_method,confidence)
                   VALUES('A001_Link01',?,99,'2026-12-31','test',0.8)""",
                (variable_id,),
            )


if __name__ == "__main__":
    unittest.main()
