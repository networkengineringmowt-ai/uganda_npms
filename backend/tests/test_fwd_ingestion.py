from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from pavement_data_engine import ingest_dynatest_f25, ingest_kuab_fwd, register_file


class FwdIngestionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        schema = Path(__file__).resolve().parents[1] / "sql" / "pms_backend_schema.sql"
        variables = Path(__file__).resolve().parents[1] / "sql" / "pms_variables.sql"
        self.conn = sqlite3.connect(self.root / "test.db")
        self.conn.executescript(schema.read_text(encoding="utf-8"))
        self.conn.executescript(variables.read_text(encoding="utf-8"))

    def tearDown(self) -> None:
        self.conn.close()
        self.temp.cleanup()

    def source(self, path: Path) -> int:
        return register_file(self.conn, "fwd", self.root, path)

    def test_ingests_kuab_measurements_and_coordinates(self) -> None:
        path = self.root / "sample.fwd"
        path.write_text(
            """IKUAB FWD FILE    : sample.fwd
HName of the Proje: Test Road
HOperator         : Engineer
HLane             : LHS
IDate Created     : 12/04/2016
IVersion          : 2.4.45
IPlate Radius     : 15.0 (cm)
ISensor Distance  : 0.0 20.0 30.0 45.0 60.0 90.0 120.0 (cm)
D 200 2 41.5 388 184 124 71 51 26 19 30 31 0032.96315 03213.82190 13:56:00
""",
            encoding="utf-16",
        )
        count = ingest_kuab_fwd(self.conn, self.source(path), path)
        self.assertEqual(count, 1)
        test = self.conn.execute("SELECT station_km,load_kn,latitude,longitude FROM pms_fwd_tests").fetchone()
        self.assertAlmostEqual(test[0], 0.2)
        self.assertAlmostEqual(test[1], 41.5)
        self.assertAlmostEqual(test[2], 0.549385833, places=6)
        self.assertAlmostEqual(test[3], 32.230365, places=6)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM pms_fwd_deflections").fetchone()[0], 7)

    def test_ingests_dynatest_station_drops(self) -> None:
        path = self.root / "sample.F25"
        path.write_text(
            """5001,25.80,1,40,3,1,"FwdWin",5.06,"guid"
5011,0,1,2020,03,22,19,02,0,"Non",000
5020,150,0,200,300,450,600,900,1200
5030,"Akol Michael"
5031,"Arua - Nebbi","A008","","DBST"
5032,"Arua - Nebbi","04","6.550","46.450"
5301,0,1,3,3,6.550,1,1,RHS,2020,03,22,09,16
5302,0,1,8,0,0,0,0,0,"note"
5303,0,N0,27.3,23.6
1,746,608.2,482.5,289.2,144.6,86.0,41.9,32.3
2,738,578.5,459.9,280.0,141.6,85.1,41.8,31.5
""",
            encoding="utf-8",
        )
        count = ingest_dynatest_f25(self.conn, self.source(path), path)
        self.assertEqual(count, 2)
        summary = self.conn.execute("SELECT test_count,deflection_count FROM pms_v_fwd_survey_summary").fetchone()
        self.assertEqual(tuple(summary), (2, 14))
        load = self.conn.execute("SELECT load_kn FROM pms_fwd_tests ORDER BY fwd_test_id LIMIT 1").fetchone()[0]
        self.assertAlmostEqual(load, 52.73, places=1)


if __name__ == "__main__":
    unittest.main()
