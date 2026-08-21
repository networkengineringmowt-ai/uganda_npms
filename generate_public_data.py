"""
Generate three public data files for the BMS React/Vite app.
"""

import json
import csv
import re
import os

DATA_DIR = "D:/OneDrive/Uganda National Road Network Repository/1.Road Network/Fetched Data"
OUT_DIR  = "D:/OneDrive/Bridge stuff/BMS_System/public"

# ---------------------------------------------------------------------------
# Task 1 – Simplified road network GeoJSON
# ---------------------------------------------------------------------------
KEEP_PROPS = {
    "road_no", "link_id", "link_name", "road_class",
    "surface_type", "length_km", "maintenance_region",
    "maintenance_station", "chainage_from", "chainage_to"
}

src_geojson = os.path.join(DATA_DIR, "uganda_national_road_network_frontend_roads_latest.geojson")
out_geojson = os.path.join(OUT_DIR, "roads.geojson")

print("Task 1: Reading GeoJSON …")
with open(src_geojson, encoding="utf-8") as f:
    raw = f.read()

# Fix any NaN before parsing
raw = re.sub(r':\s*NaN\b', ': null', raw)
gj = json.loads(raw)

stripped_features = []
for feat in gj.get("features", []):
    props = feat.get("properties") or {}
    slim_props = {k: props.get(k) for k in KEEP_PROPS}
    stripped_features.append({
        "type": "Feature",
        "geometry": feat.get("geometry"),
        "properties": slim_props
    })

slim_gj = {
    "type": "FeatureCollection",
    "features": stripped_features
}

print(f"Task 1: Writing {len(stripped_features)} features to roads.geojson …")
with open(out_geojson, "w", encoding="utf-8") as f:
    json.dump(slim_gj, f, separators=(",", ":"))

size1 = os.path.getsize(out_geojson)
print(f"Task 1 done: roads.geojson = {size1:,} bytes ({size1/1024/1024:.2f} MB)")

# ---------------------------------------------------------------------------
# Task 2 – Projects JSON
# ---------------------------------------------------------------------------
src_projects = os.path.join(DATA_DIR, "uganda_national_road_network_ongoing_projects_progress_latest.csv")
out_projects  = os.path.join(OUT_DIR, "projects.json")

print("\nTask 2: Reading projects CSV …")
with open(src_projects, encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    rows = list(reader)

print(f"Task 2: Writing {len(rows)} rows to projects.json …")
with open(out_projects, "w", encoding="utf-8") as f:
    json.dump(rows, f, separators=(",", ":"))

size2 = os.path.getsize(out_projects)
print(f"Task 2 done: projects.json = {size2:,} bytes ({size2/1024:.1f} KB)")

# ---------------------------------------------------------------------------
# Task 3 – Analytics JSON
# ---------------------------------------------------------------------------
src_excel   = os.path.join(DATA_DIR, "uganda_national_road_network_excel_analytics_latest.json")
src_traffic = os.path.join(DATA_DIR, "uganda_national_road_network_traffic_year_summary_latest.csv")
src_wtss    = os.path.join(DATA_DIR, "uganda_paved_national_road_network_wtss_2015_2023.csv")
src_snap    = os.path.join(DATA_DIR, "uganda_national_road_network_dashboard_snapshot_latest.json")
out_analytics = os.path.join(OUT_DIR, "analytics.json")

def load_json_safe(path):
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    raw = re.sub(r':\s*NaN\b', ': null', raw)
    return json.loads(raw)

def load_csv(path):
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return list(reader)

print("\nTask 3: Reading analytics sources …")
excel_data   = load_json_safe(src_excel)
traffic_data = load_csv(src_traffic)
wtss_data    = load_csv(src_wtss)
snap_data    = load_json_safe(src_snap)

analytics = {
    "excel_analytics":    excel_data,
    "traffic_year_summary": traffic_data,
    "wtss_2015_2023":     wtss_data,
    "dashboard_snapshot": snap_data
}

print("Task 3: Writing analytics.json …")
with open(out_analytics, "w", encoding="utf-8") as f:
    json.dump(analytics, f, separators=(",", ":"))

size3 = os.path.getsize(out_analytics)
print(f"Task 3 done: analytics.json = {size3:,} bytes ({size3/1024:.1f} KB)")

# ---------------------------------------------------------------------------
print("\n=== All tasks complete ===")
print(f"  roads.geojson    : {os.path.getsize(out_geojson):>12,} bytes")
print(f"  projects.json    : {os.path.getsize(out_projects):>12,} bytes")
print(f"  analytics.json   : {os.path.getsize(out_analytics):>12,} bytes")
