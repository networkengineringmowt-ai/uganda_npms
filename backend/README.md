# Uganda NPMS backend

Production-ready SQLite, SQL-function, machine-learning, and API backend for the
Uganda National Pavement Management System.

## Components

- `pms_backend/config.py` — typed environment variables and validation.
- `pms_backend/variables.py` — the canonical registry of 17 engineering, traffic,
  climate, model-output, and decision variables.
- `pms_backend/database.py` — database connection, migrations, transactions, and
  six registered SQLite functions.
- `sql/pms_backend_schema.sql` — normalized source, condition, inventory, model,
  prediction, audit, and infographic tables.
- `sql/pms_functions.sql` — ML training-pair, decision, and network-KPI views plus
  value-range triggers.
- `pms_backend/ml.py` — reproducible random-forest deterioration model, metrics,
  artifact persistence, and model-run registration.
- `pms_backend/api.py` — FastAPI read, prediction, SQL evaluation, variable, and
  health endpoints.
- `pavement_data_engine.py` — full repository ingestion and current-value engine.
- `server/` — the existing Node write-back and Supabase-mirror service.

## Install and build

```powershell
cd backend
Copy-Item .env.example .env
python -m pip install -e .
.\build_backend.ps1
```

The standard build compiles all Python code, runs the tests, applies database
migrations, registers SQL functions, and loads the canonical variables.

For full source ingestion or ML training:

```powershell
.\build_backend.ps1 -FullIngest
.\build_backend.ps1 -Train
```

Training requires at least `PMS_MIN_TRAINING_ROWS` sequential observation pairs.
The backend never invents missing production observations; until a trained artifact
exists, predictions use the documented deterministic deterioration fallback.

## Run the API

```powershell
python -m pms_backend serve --host 0.0.0.0 --port 8000
```

Documentation is available at `http://localhost:8000/docs`.

Key endpoints:

- `GET /health`
- `GET /api/variables`
- `GET /api/settings` (protect with `PMS_ADMIN_KEY`)
- `GET /api/links`
- `GET /api/links/{link_id}`
- `GET /api/ml/model`
- `POST /api/ml/predict`
- `POST /api/sql/evaluate`

## Registered SQL functions

| Function | Purpose |
|---|---|
| `pms_clamp(value,min,max)` | Enforce numerical bounds |
| `pms_condition_band(iri)` | Classify Good/Fair/Poor/Very Poor |
| `pms_intervention(iri,rut,cracking,surface)` | Recommend treatment |
| `pms_confidence(observed_year,target_year,base)` | Decay confidence by forecast horizon |
| `pms_deteriorated_iri(iri,years,surface)` | Deterministic fallback forecast |
| `pms_priority_score(iri,rut,cracking,aadt)` | Produce a 0–100 intervention score |

## Deployment note

GitHub Pages only hosts the static NPMS frontend. Run this backend on a Python-capable
service or the Ministry network, then configure the frontend API URL for that service.
Never commit `.env`, service-role keys, database files, or trained artifacts.
