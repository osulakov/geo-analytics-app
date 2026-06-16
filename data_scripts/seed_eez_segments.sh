#!/usr/bin/env bash
#
# seed_eez_segments.sh — load EEZ boundary lines into a persistent table.
#
# Splits analyses_scripts/eez-simplified.geojson into individual 2-point
# segments and stores them in `eez_segments(name, geom LineString/4326)` with a
# GIST index. This lets the geofence analysis detect crossings on the fly
# (ais_pings × eez_segments) instead of reading precomputed events.
#
# Re-runnable: drops and rebuilds the table.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EEZ_FILE="${EEZ_GEOJSON:-${SCRIPT_DIR}/eez-simplified.geojson}"

CONTAINER_NAME="${DB_CONTAINER_NAME:-geo-analytics-db}"
POSTGRES_DB="${POSTGRES_DB:-geo_analytics}"
POSTGRES_USER="${POSTGRES_USER:-geo}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not on PATH." >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required to parse the EEZ GeoJSON." >&2
  exit 1
fi
if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  echo "Error: container '${CONTAINER_NAME}' is not running." >&2
  echo "Start it with: deployment_scripts/deploy_database.sh" >&2
  exit 1
fi
if [ ! -f "${EEZ_FILE}" ]; then
  echo "Error: EEZ GeoJSON not found at ${EEZ_FILE}." >&2
  exit 1
fi

# Split the EEZ GeoJSON into 2-point segments as TSV (x1 y1 x2 y2 name).
GEN_JS="$(mktemp)"
trap 'rm -f "${GEN_JS}"' EXIT
cat >"${GEN_JS}" <<'NODE'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
function eezLabel(props) {
  const p = props || {};
  const name = p.LINE_NAME || p.EEZ1 || p.TERRITORY1 || 'EEZ boundary';
  return String(name).replace(/[\t\r\n\\]/g, ' ');
}
function emitLine(line, name) {
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    if (Array.isArray(a) && Array.isArray(b)) {
      process.stdout.write(`${a[0]}\t${a[1]}\t${b[0]}\t${b[1]}\t${name}\n`);
    }
  }
}
function walk(coords, name) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === 'number') return;
  if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
    emitLine(coords, name);
    return;
  }
  for (const child of coords) walk(child, name);
}
for (const feat of data.features || []) {
  if (feat.geometry && feat.geometry.coordinates) {
    walk(feat.geometry.coordinates, eezLabel(feat.properties));
  }
}
NODE

echo "Seeding eez_segments from ${EEZ_FILE}..."

{
  cat <<'SQL_HEAD'
DROP TABLE IF EXISTS eez_segments;
CREATE TABLE eez_segments (
    id   BIGSERIAL PRIMARY KEY,
    x1   double precision,
    y1   double precision,
    x2   double precision,
    y2   double precision,
    name text
);
COPY eez_segments (x1, y1, x2, y2, name) FROM stdin;
SQL_HEAD

  node "${GEN_JS}" "${EEZ_FILE}"

  cat <<'SQL_TAIL'
\.
ALTER TABLE eez_segments ADD COLUMN geom geometry(LineString, 4326);
UPDATE eez_segments SET geom = ST_SetSRID(ST_MakeLine(ST_MakePoint(x1, y1), ST_MakePoint(x2, y2)), 4326);
CREATE INDEX eez_segments_gix ON eez_segments USING GIST (geom);
ANALYZE eez_segments;
SQL_TAIL
} | docker exec -i "${CONTAINER_NAME}" \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

docker exec -i "${CONTAINER_NAME}" \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT count(*) AS eez_segments FROM eez_segments;"

echo "Done."
