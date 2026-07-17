from __future__ import annotations

import argparse
import json
import sys

import uvicorn

from .config import settings
from .database import connect, migrate
from .ml import PavementDeteriorationModel, refresh_training_rows, register_model_run, training_rows


def init_database() -> dict:
    conn = connect()
    try:
        migrate(conn)
        return {
            "database": str(settings.database_path),
            "variables": conn.execute("SELECT COUNT(*) FROM pms_variable_definitions").fetchone()[0],
            "sql_functions": 6,
            "status": "ready",
        }
    finally:
        conn.close()


def train_model() -> dict:
    conn = connect()
    try:
        migrate(conn)
        count = refresh_training_rows(conn)
        rows = training_rows(conn)
        model = PavementDeteriorationModel()
        metadata = model.train(rows)
        artifact = model.save()
        model_run_id = register_model_run(conn, metadata)
        return {"training_rows": count, "model_run_id": model_run_id, "artifact": str(artifact), "metadata": metadata.__dict__}
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Uganda NPMS backend management CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("init-db", help="Create or migrate the SQLite database and register variables")
    subparsers.add_parser("train", help="Build observation pairs and train the deterioration model")
    subparsers.add_parser("build", help="Initialize the database and train when enough rows are available")
    serve = subparsers.add_parser("serve", help="Start the FastAPI server")
    serve.add_argument("--host", default=settings.host)
    serve.add_argument("--port", type=int, default=settings.port)
    args = parser.parse_args()

    try:
        if args.command == "init-db":
            result = init_database()
        elif args.command == "train":
            result = train_model()
        elif args.command == "build":
            result = init_database()
            conn = connect()
            try:
                rows = refresh_training_rows(conn)
            finally:
                conn.close()
            result["training_rows"] = rows
            result["model"] = train_model() if rows >= settings.min_training_rows else {"status": "skipped", "reason": f"requires {settings.min_training_rows} observation pairs"}
        else:
            uvicorn.run("pms_backend.api:app", host=args.host, port=args.port, reload=False)
            return
        print(json.dumps(result, indent=2, default=str))
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, indent=2), file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
