from __future__ import annotations

import json
import os
import sqlite3
from collections import defaultdict, deque
from pathlib import Path
from typing import Any, Iterable

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb


SOURCE_DATABASE = Path(os.environ["PMS_DB_PATH"]).expanduser().resolve()
TARGET_DATABASE_URL = os.environ["PMS_DATABASE_URL"]
TABLE_PREFIX = os.getenv("PMS_TABLE_PREFIX", "pms_")
TARGET_SCHEMA = os.getenv("PMS_TARGET_SCHEMA", "public")
PREPARE_THRESHOLD = int(os.environ["PMS_POSTGRES_PREPARE_THRESHOLD"]) if os.getenv("PMS_POSTGRES_PREPARE_THRESHOLD") else None
STATEMENT_TIMEOUT_MS = int(os.getenv("PMS_POSTGRES_STATEMENT_TIMEOUT_MS", "0"))
SYNC_BATCH_SIZE = int(os.getenv("PMS_SYNC_BATCH_SIZE", "50000"))
SYNC_WRITE_MODE = os.getenv("PMS_SYNC_WRITE_MODE", "upsert").strip().lower()
SYNC_REPLACE_EXISTING = os.getenv("PMS_SYNC_REPLACE_EXISTING", "false").strip().lower() in {"1", "true", "yes"}
SYNC_ROW_OFFSET = int(os.getenv("PMS_SYNC_ROW_OFFSET", "0"))
SYNC_ROW_LIMIT = int(os.environ["PMS_SYNC_ROW_LIMIT"]) if os.getenv("PMS_SYNC_ROW_LIMIT") else None
SYNC_TABLES = {
    name.strip()
    for name in os.getenv("PMS_SYNC_TABLES", "").split(",")
    if name.strip()
}


def source_tables(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ? ORDER BY name",
        (f"{TABLE_PREFIX}%",),
    )
    return [row[0] for row in rows]


def dependency_order(conn: sqlite3.Connection, tables: list[str]) -> list[str]:
    table_set = set(tables)
    dependencies: dict[str, set[str]] = {name: set() for name in tables}
    dependants: dict[str, set[str]] = defaultdict(set)
    for table in tables:
        quoted = table.replace("'", "''")
        for row in conn.execute(f"PRAGMA foreign_key_list('{quoted}')"):
            parent = row[2]
            if parent in table_set and parent != table:
                dependencies[table].add(parent)
                dependants[parent].add(table)
    ready = deque(sorted(name for name, parents in dependencies.items() if not parents))
    ordered: list[str] = []
    while ready:
        table = ready.popleft()
        ordered.append(table)
        for dependant in sorted(dependants[table]):
            dependencies[dependant].discard(table)
            if not dependencies[dependant] and dependant not in ordered and dependant not in ready:
                ready.append(dependant)
    return ordered + sorted(set(tables) - set(ordered))


def target_columns(conn: psycopg.Connection, table: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT column_name,data_type
           FROM information_schema.columns
           WHERE table_schema=%s AND table_name=%s
           ORDER BY ordinal_position""",
        (TARGET_SCHEMA, table),
    ).fetchall()
    return [{"name": row[0], "type": row[1]} for row in rows]


def adapt_row(row: sqlite3.Row, columns: list[dict[str, Any]]) -> tuple[Any, ...]:
    values: list[Any] = []
    for column in columns:
        value = row[column["name"]]
        if value is not None and column["type"] in {"json", "jsonb"}:
            value = Jsonb(json.loads(value) if isinstance(value, str) else value)
        values.append(value)
    return tuple(values)


def sync_table(source: sqlite3.Connection, target: psycopg.Connection, table: str) -> dict[str, int | str]:
    source_info = list(source.execute(f"PRAGMA table_info('{table}')"))
    source_names = {row[1] for row in source_info}
    primary_keys = [row[1] for row in sorted(source_info, key=lambda row: row[5]) if row[5]]
    columns = [column for column in target_columns(target, table) if column["name"] in source_names]
    if not columns:
        return {"table": table, "source_rows": 0, "inserted_rows": 0}
    names = [column["name"] for column in columns]
    staging = f"npms_stage_{table}"
    if SYNC_WRITE_MODE == "copy":
        existing_rows = target.execute(
            sql.SQL("SELECT count(*) FROM {}.{}").format(
                sql.Identifier(TARGET_SCHEMA), sql.Identifier(table)
            )
        ).fetchone()[0]
        if existing_rows and not SYNC_REPLACE_EXISTING:
            raise ValueError(
                f"Direct copy requires an empty target table: {TARGET_SCHEMA}.{table} has {existing_rows} rows"
            )
        if existing_rows:
            target.execute(
                sql.SQL("DELETE FROM {}.{}").format(
                    sql.Identifier(TARGET_SCHEMA), sql.Identifier(table)
                )
            )
            target.commit()
    source_query = "SELECT " + ",".join(f'"{name}"' for name in names) + f' FROM "{table}"'
    if primary_keys:
        source_query += " ORDER BY " + ",".join(f'"{name}"' for name in primary_keys)
    source_parameters: list[int] = []
    if SYNC_ROW_LIMIT is not None:
        source_query += " LIMIT ? OFFSET ?"
        source_parameters.extend((SYNC_ROW_LIMIT, SYNC_ROW_OFFSET))
    elif SYNC_ROW_OFFSET:
        source_query += " LIMIT -1 OFFSET ?"
        source_parameters.append(SYNC_ROW_OFFSET)
    source_cursor = source.execute(source_query, source_parameters)
    source_rows = 0
    inserted_rows = 0
    while batch := source_cursor.fetchmany(SYNC_BATCH_SIZE):
        if SYNC_WRITE_MODE == "upsert":
            target.execute(
                sql.SQL("CREATE TEMP TABLE {} (LIKE {}.{} INCLUDING DEFAULTS) ON COMMIT DROP").format(
                    sql.Identifier(staging), sql.Identifier(TARGET_SCHEMA), sql.Identifier(table)
                )
            )
            copy_target = sql.Identifier(staging)
        else:
            copy_target = sql.SQL("{}.{}").format(
                sql.Identifier(TARGET_SCHEMA), sql.Identifier(table)
            )
        copy_statement = sql.SQL("COPY {} ({}) FROM STDIN").format(
            copy_target, sql.SQL(",").join(map(sql.Identifier, names))
        )
        with target.cursor().copy(copy_statement) as copy:
            for row in batch:
                copy.write_row(adapt_row(row, columns))
        if SYNC_WRITE_MODE == "upsert":
            insert_statement = sql.SQL("INSERT INTO {}.{} ({}) SELECT {} FROM {} ON CONFLICT DO NOTHING").format(
                sql.Identifier(TARGET_SCHEMA), sql.Identifier(table),
                sql.SQL(",").join(map(sql.Identifier, names)),
                sql.SQL(",").join(map(sql.Identifier, names)),
                sql.Identifier(staging),
            )
            inserted_rows += target.execute(insert_statement).rowcount
        else:
            inserted_rows += len(batch)
        source_rows += len(batch)
        target.commit()
        print(
            json.dumps({"table": table, "processed_rows": source_rows, "inserted_rows": inserted_rows}),
            flush=True,
        )
    identity = target.execute(
        """SELECT column_name
           FROM information_schema.columns
           WHERE table_schema=%s AND table_name=%s AND is_identity='YES'
           ORDER BY ordinal_position LIMIT 1""",
        (TARGET_SCHEMA, table),
    ).fetchone()
    if identity:
        sequence_name = target.execute("SELECT pg_get_serial_sequence(%s,%s)", (f"{TARGET_SCHEMA}.{table}", identity[0])).fetchone()[0]
        if sequence_name:
            target.execute(
                sql.SQL("SELECT setval(%s,COALESCE((SELECT MAX({}) FROM {}.{}),1),true)").format(
                    sql.Identifier(identity[0]), sql.Identifier(TARGET_SCHEMA), sql.Identifier(table)
                ),
                (sequence_name,),
            )
    return {"table": table, "source_rows": source_rows, "inserted_rows": inserted_rows}


def main() -> None:
    if not SOURCE_DATABASE.is_file():
        raise FileNotFoundError(f"PMS_DB_PATH does not exist: {SOURCE_DATABASE}")
    if SYNC_BATCH_SIZE <= 0:
        raise ValueError("PMS_SYNC_BATCH_SIZE must be greater than zero")
    if SYNC_WRITE_MODE not in {"upsert", "copy", "append"}:
        raise ValueError("PMS_SYNC_WRITE_MODE must be 'upsert', 'copy', or 'append'")
    if SYNC_ROW_OFFSET < 0:
        raise ValueError("PMS_SYNC_ROW_OFFSET cannot be negative")
    if SYNC_ROW_LIMIT is not None and SYNC_ROW_LIMIT <= 0:
        raise ValueError("PMS_SYNC_ROW_LIMIT must be greater than zero")
    source_uri = f"file:{SOURCE_DATABASE.as_posix()}?mode=ro&immutable=1"
    with sqlite3.connect(source_uri, uri=True) as source, psycopg.connect(
        TARGET_DATABASE_URL,
        prepare_threshold=PREPARE_THRESHOLD,
    ) as target:
        source.row_factory = sqlite3.Row
        target.execute(
            "SELECT set_config('statement_timeout', %s, false)",
            (str(STATEMENT_TIMEOUT_MS),),
        )
        available_tables = source_tables(source)
        unknown_tables = SYNC_TABLES.difference(available_tables)
        if unknown_tables:
            raise ValueError(f"PMS_SYNC_TABLES contains unknown tables: {sorted(unknown_tables)}")
        tables = dependency_order(source, available_tables)
        if SYNC_TABLES:
            tables = [table for table in tables if table in SYNC_TABLES]
        results = []
        for table in tables:
            result = sync_table(source, target, table)
            target.commit()
            results.append(result)
            print(json.dumps(result), flush=True)
        print(json.dumps({"status": "complete", "tables": len(results), "results": results}, indent=2))


if __name__ == "__main__":
    main()
