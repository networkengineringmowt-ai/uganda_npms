from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from .database import execute, is_postgres


def _postgres_catalog(conn) -> dict[str, Any]:
    from psycopg import sql

    table_rows = execute(conn, """
        SELECT tablename AS name
        FROM pg_catalog.pg_tables
        WHERE schemaname='public' AND tablename LIKE 'pms_%'
        ORDER BY tablename
    """).fetchall()
    tables = []
    for table_row in table_rows:
        name = table_row["name"]
        columns = execute(conn, """
            SELECT ordinal_position-1 AS cid,column_name AS name,data_type AS type,
                   CASE WHEN is_nullable='NO' THEN 1 ELSE 0 END AS notnull,
                   column_default AS dflt_value
            FROM information_schema.columns
            WHERE table_schema='public' AND table_name=?
            ORDER BY ordinal_position
        """, (name,)).fetchall()
        foreign_keys = execute(conn, """
            SELECT c.conname AS name,pg_get_constraintdef(c.oid) AS definition
            FROM pg_constraint c
            JOIN pg_class t ON t.oid=c.conrelid
            JOIN pg_namespace n ON n.oid=t.relnamespace
            WHERE n.nspname='public' AND t.relname=? AND c.contype='f'
            ORDER BY c.conname
        """, (name,)).fetchall()
        indexes = execute(conn, """
            SELECT indexname AS name,indexdef AS definition
            FROM pg_indexes WHERE schemaname='public' AND tablename=?
            ORDER BY indexname
        """, (name,)).fetchall()
        count = conn.execute(sql.SQL("SELECT COUNT(*) AS count FROM {}.{}").format(
            sql.Identifier("public"), sql.Identifier(name)
        )).fetchone()["count"]
        tables.append({
            "name": name,
            "row_count": int(count),
            "columns": [dict(row) for row in columns],
            "foreign_keys": [dict(row) for row in foreign_keys],
            "indexes": [dict(row) for row in indexes],
            "sql": None,
        })
    views = execute(conn, """
        SELECT viewname AS name,definition AS sql
        FROM pg_views WHERE schemaname='public' AND viewname LIKE 'pms_%'
        ORDER BY viewname
    """).fetchall()
    indexes = execute(conn, """
        SELECT indexname AS name,tablename AS table,indexdef AS sql
        FROM pg_indexes WHERE schemaname='public' AND tablename LIKE 'pms_%'
        ORDER BY indexname
    """).fetchall()
    triggers = execute(conn, """
        SELECT trigger_name AS name,event_object_table AS table,action_statement AS sql
        FROM information_schema.triggers
        WHERE trigger_schema='public' AND event_object_table LIKE 'pms_%'
        ORDER BY trigger_name
    """).fetchall()
    return {
        "engine": "Supabase PostgreSQL",
        "tables": tables,
        "views": [dict(row) for row in views],
        "indexes": [dict(row) for row in indexes],
        "triggers": [dict(row) for row in triggers],
        "variables": [dict(row) for row in execute(conn, "SELECT * FROM pms_variable_definitions ORDER BY category,canonical_name")],
        "settings": [dict(row) for row in execute(conn, "SELECT * FROM pms_engine_settings ORDER BY setting_key")],
        "parser_variables": [dict(row) for row in execute(conn, "SELECT * FROM pms_parser_variables ORDER BY parser_name,variable_name")],
        "ingestion_formats": [dict(row) for row in execute(conn, "SELECT * FROM pms_ingestion_formats ORDER BY repository_group,extension")],
    }


def schema_catalog(conn) -> dict[str, Any]:
    if is_postgres(conn):
        return _postgres_catalog(conn)
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
