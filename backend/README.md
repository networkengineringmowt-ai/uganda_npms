# Uganda NPMS backend engine

The backend indexes the three canonical repository roots:

- `0. Manuals/Pavement Design Manuals`
- `5.Road Condition Data`
- `6.Road Inventory Data`

It builds `ugnrms/data/traffic_platform.db`, extracts searchable PDF/DOCX manual text,
catalogues every Excel and Access table/field, normalizes condition and inventory rows,
trains a deep multi-output MLP, and writes timestamped link-level current values with
source lineage, method and confidence. The ten-infographic static bundle is written to
`ugnrms/public/data/pms_dashboard.json`.

## Build or refresh

From the `ugnrms` application directory:

```powershell
python scripts/pavement_data_engine.py
```

Useful refresh modes:

```powershell
python scripts/pavement_data_engine.py --only-access-metadata
python scripts/pavement_data_engine.py --skip-source-ingest
python scripts/pavement_data_engine.py --skip-access-metadata
```

## SQL model

`sql/pms_backend_schema.sql` defines the normalized source, variable, road-link,
condition, inventory, model, prediction, current-value and infographic tables. It also
defines current-link-state, source-coverage and variable-lineage views. All API filters
use parameterized SQL.

## API

Install and run the backend server from `ugnrms/server`:

```powershell
npm install
npm start
```

Read endpoints:

- `GET /api/pms/dashboard`
- `GET /api/pms/links?region=&surface=&search=&limit=&offset=`
- `GET /api/pms/links/:linkId`
- `GET /api/pms/sources`
- `GET /api/pms/variables`

Set `PMS_DB_PATH` only when the SQLite database is outside the default
`ugnrms/data/traffic_platform.db` location.
