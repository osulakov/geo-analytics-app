#!/usr/bin/env bash
#
# geofence_enter_exit.sh — detect EEZ geofence crossings in ais_pings.
#
# Walks every vessel's time-ordered pings, takes each adjacent pair (two pings
# next to each other in time), and checks whether the segment between them
# crosses an EEZ boundary line (analyses_scripts/eez-simplified.geojson). Each
# crossing is written to the `events` table as:
#   mmsi, event_type='geofence_enter_exit', subtype='enter'|'exit',
#   ts (midpoint of the pair), position (the crossing point on the EEZ line).
#
# enter/exit is derived from the crossing direction relative to the boundary
# segment's orientation (cross-product sign) — deterministic, but note the
# EEZ data is boundary lines, so it reflects crossing direction rather than a
# true inside/outside polygon test.
#
# Re-runnable: clears existing 'geofence_enter_exit' events first.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EEZ_FILE="${EEZ_GEOJSON:-${SCRIPT_DIR}/eez-simplified.geojson}"

CONTAINER_NAME="${DB_CONTAINER_NAME:-geo-analytics-db}"
POSTGRES_DB="${POSTGRES_DB:-geo_analytics}"
POSTGRES_USER="${POSTGRES_USER:-geo}"

# --- Preconditions ----------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not on PATH." >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required to parse the EEZ GeoJSON." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Error: the Docker daemon is not running." >&2
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

ping_count="$(docker exec -i "${CONTAINER_NAME}" \
  psql -tA -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT count(*) FROM ais_pings;" 2>/dev/null || echo 0)"
if [ "${ping_count}" = "0" ]; then
  echo "Error: ais_pings is empty. Seed it with data_scripts/two_weeks_pings_from_now.sh" >&2
  exit 1
fi

# Helper: split the EEZ GeoJSON into individual 2-point boundary segments,
# emitted as TSV (x1 y1 x2 y2) for a COPY into Postgres.
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

echo "Detecting EEZ geofence crossings for ${ping_count} pings..."

{
  cat <<'SQL_HEAD'
CREATE TEMP TABLE eez_seg (x1 double precision, y1 double precision, x2 double precision, y2 double precision, name text);
COPY eez_seg (x1, y1, x2, y2, name) FROM stdin;
SQL_HEAD

  node "${GEN_JS}" "${EEZ_FILE}"

  cat <<'SQL_TAIL'
\.
ALTER TABLE eez_seg ADD COLUMN geom geometry(LineString, 4326);
UPDATE eez_seg SET geom = ST_SetSRID(ST_MakeLine(ST_MakePoint(x1, y1), ST_MakePoint(x2, y2)), 4326);
CREATE INDEX ON eez_seg USING GIST (geom);
ANALYZE eez_seg;

CREATE TABLE IF NOT EXISTS events (
    id         BIGSERIAL PRIMARY KEY,
    mmsi       VARCHAR(9) NOT NULL,
    event_type TEXT NOT NULL,
    subtype    TEXT,
    ts         TIMESTAMPTZ NOT NULL,
    position   GEOGRAPHY(Point, 4326) NOT NULL,
    details    JSONB
);
-- Dynamic, event-type-specific payload (e.g. the crossed EEZ name).
ALTER TABLE events ADD COLUMN IF NOT EXISTS details JSONB;
CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts);
CREATE INDEX IF NOT EXISTS events_position_gix ON events USING GIST (position);

-- Rebuild this event type from scratch.
DELETE FROM events WHERE event_type = 'geofence_enter_exit';

INSERT INTO events (mmsi, event_type, subtype, ts, position, details)
WITH ordered AS (
    SELECT
        mmsi,
        ts,
        position::geometry AS p,
        lead(ts)                 OVER w AS ts2,
        lead(position::geometry) OVER w AS p2
    FROM ais_pings
    WINDOW w AS (PARTITION BY mmsi ORDER BY ts)
),
-- Adjacent (in time) ping pairs that actually moved.
pairs AS (
    SELECT mmsi, ts, ts2, p, p2, ST_MakeLine(p, p2) AS seg
    FROM ordered
    WHERE p2 IS NOT NULL AND NOT ST_Equals(p, p2)
),
crossings AS (
    SELECT
        pr.mmsi,
        pr.ts,
        pr.ts2,
        pr.p,
        pr.p2,
        s.geom AS bseg,
        s.name AS eez_name,
        ST_Centroid(ST_Intersection(pr.seg, s.geom)) AS xpoint
    FROM pairs pr
    JOIN eez_seg s ON ST_Intersects(pr.seg, s.geom)
)
SELECT
    mmsi,
    'geofence_enter_exit',
    CASE
        WHEN (ST_X(ST_EndPoint(bseg)) - ST_X(ST_StartPoint(bseg))) * (ST_Y(p2) - ST_Y(p))
           - (ST_Y(ST_EndPoint(bseg)) - ST_Y(ST_StartPoint(bseg))) * (ST_X(p2) - ST_X(p)) >= 0
        THEN 'enter'
        ELSE 'exit'
    END AS subtype,
    ts + (ts2 - ts) / 2 AS ts,
    ST_SetSRID(xpoint, 4326)::geography AS position,
    jsonb_build_object('eez', eez_name) AS details
FROM crossings
WHERE xpoint IS NOT NULL AND NOT ST_IsEmpty(xpoint);
SQL_TAIL
} | docker exec -i "${CONTAINER_NAME}" \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

# --- Summary ----------------------------------------------------------------
docker exec -i "${CONTAINER_NAME}" \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT subtype, count(*)
        FROM events
       WHERE event_type = 'geofence_enter_exit'
       GROUP BY subtype
       ORDER BY subtype;"

echo "Done."
