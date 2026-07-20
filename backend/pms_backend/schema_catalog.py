from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


def schema_catalog(conn: sqlite3.Connection) -> dict[str, Any]:
    objects = conn.execute(
        """SELECT type,name,tbl_name,sql
           FROM sqlite_master
           WHERE name NOT LIKE 'sqlite_%' AND type IN ('table','view','index','trigger')
           ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'view' THEN 2 WHEN 'index' THEN 3 ELSE 4 END,name"""
    ).fetchall()
    tables = []
    for obj in (row for row in objects if row[0] == "table"):
        name = obj[1]
        columns = [dict(row) for row in conn.execute(f"PRAGMA table_info([{name}])")]
        foreign_keys = [dict(row) for row in conn.execute(f"PRAGMA foreign_key_list([{name}])")]
        indexes = [dict(row) for row in conn.execute(f"PRAGMA index_list([{name}])")]
        count = int(conn.execute(f"SELECT COUNT(*) FROM [{name}]").fetchone()[0])
        tables.append({
            "name": name,
            "row_count": count,
            "columns": columns,
            "foreign_keys": foreign_keys,
            "indexes": indexes,
            "sql": obj[3],
        })
    return {
        "engine": "SQLite",
        "tables": tables,
        "views": [{"name": row[1], "sql": row[3]} for row in objects if row[0] == "view"],
        "indexes": [{"name": row[1], "table": row[2], "sql": row[3]} for row in objects if row[0] == "index"],
        "triggers": [{"name": row[1], "table": row[2], "sql": row[3]} for row in objects if row[0] == "trigger"],
        "variables": [dict(row) for row in conn.execute("SELECT * FROM pms_variable_definitions ORDER BY category,canonical_name")],
        "settings": [dict(row) for row in conn.execute("SELECT * FROM pms_engine_settings ORDER BY setting_key")],
        "parser_variables": [dict(row) for row in conn.execute("SELECT * FROM pms_parser_variables ORDER BY parser_name,variable_name")],
        "ingestion_formats": [dict(row) for row in conn.execute("SELECT * FROM pms_ingestion_formats ORDER BY repository_group,extension")],
    }


def write_schema_catalog(conn: sqlite3.Connection, path: Path) -> dict[str, Any]:
    document = schema_catalog(conn)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=2, ensure_ascii=False), encoding="utf-8")
    return document
