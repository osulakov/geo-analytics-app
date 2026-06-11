#!/usr/bin/env bash
#
# two_weeks_pings_from_now.sh — fill ais_pings with 2 weeks of hourly pings.
#
# For every vessel currently in static_vessel_info, generates one ping per hour
# for the last 14 days (336 pings/vessel), ending at the current hour. Each
# vessel travels along a great-circle route between two major world ports, so
# the tracks cross busy shipping lanes.
#
# Each ping has only: mmsi, ts (timestamp), position (PostGIS point), heading.
#
# This REPLACES any existing rows in ais_pings (truncates first) so the window
# is always "the last two weeks from now". Targets the container from
# deployment_scripts/deploy_database.sh.
#
set -euo pipefail

CONTAINER_NAME="${DB_CONTAINER_NAME:-geo-analytics-db}"
POSTGRES_DB="${POSTGRES_DB:-geo_analytics}"
POSTGRES_USER="${POSTGRES_USER:-geo}"

# --- Preconditions ----------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not on PATH." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Error: the Docker daemon is not running. Start Docker and retry." >&2
  exit 1
fi
if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  echo "Error: container '${CONTAINER_NAME}' is not running." >&2
  echo "Start it first with: deployment_scripts/deploy_database.sh" >&2
  exit 1
fi

# Require seeded vessels — the MMSI list is read from static_vessel_info.
vessel_count="$(docker exec -i "${CONTAINER_NAME}" \
  psql -tA -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT count(*) FROM static_vessel_info;" 2>/dev/null || echo 0)"
if [ "${vessel_count}" = "0" ]; then
  echo "Error: static_vessel_info is empty." >&2
  echo "Seed it first with: data_scripts/seed_static_vessel_info.sh" >&2
  exit 1
fi

echo "Generating 2 weeks of hourly pings for ${vessel_count} vessel(s)..."

docker exec -i "${CONTAINER_NAME}" \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" <<'SQL'
CREATE TABLE IF NOT EXISTS ais_pings (
    mmsi     VARCHAR(9) NOT NULL REFERENCES static_vessel_info(mmsi) ON DELETE CASCADE,
    ts       TIMESTAMPTZ NOT NULL,
    position GEOGRAPHY(Point, 4326) NOT NULL,
    heading  NUMERIC(5,2),
    PRIMARY KEY (mmsi, ts)
);
CREATE INDEX IF NOT EXISTS ais_pings_ts_idx ON ais_pings (ts);
CREATE INDEX IF NOT EXISTS ais_pings_position_gix ON ais_pings USING GIST (position);

-- Always (re)build the trailing two-week window.
TRUNCATE TABLE ais_pings;

INSERT INTO ais_pings (mmsi, ts, position, heading)
WITH ports(idx, lon, lat) AS (
    VALUES
        (0,  121.80,  31.23),  -- Shanghai
        (1,  103.85,   1.29),  -- Singapore
        (2,    4.40,  51.95),  -- Rotterdam
        (3, -118.27,  33.74),  -- Los Angeles
        (4,    9.97,  53.55),  -- Hamburg
        (5,  -74.05,  40.65),  -- New York
        (6,  114.17,  22.30),  -- Hong Kong
        (7,  129.04,  35.10),  -- Busan
        (8,   55.03,  25.01),  -- Dubai (Jebel Ali)
        (9,  -46.30, -23.96),  -- Santos
        (10,  31.05, -29.87),  -- Durban
        (11, 151.21, -33.86),  -- Sydney
        (12, -79.90,   9.36),  -- Colon (Panama)
        (13,  32.55,  29.97),  -- Suez
        (14,  23.63,  37.94),  -- Piraeus
        (15,  72.84,  18.94),  -- Mumbai
        (16, 139.77,  35.62),  -- Tokyo
        (17,   4.40,  51.26),  -- Antwerp
        (18,  -0.32,  39.44),  -- Valencia
        (19,  30.72,  46.48)   -- Odessa
),
nports AS (
    SELECT count(*)::int AS n FROM ports
),
vessels AS (
    SELECT mmsi, (row_number() OVER (ORDER BY mmsi) - 1)::int AS v
    FROM static_vessel_info
),
routes AS (
    -- origin = v % n; destination is a different port (guaranteed via step in 1..n-1).
    SELECT
        ve.mmsi,
        ve.v,
        o.lon AS olon, o.lat AS olat,
        d.lon AS dlon, d.lat AS dlat
    FROM vessels ve
    CROSS JOIN nports np
    JOIN ports o ON o.idx = ve.v % np.n
    JOIN ports d ON d.idx = ((ve.v % np.n) + 1 + (ve.v % (np.n - 1))) % np.n
),
positions AS (
    SELECT
        r.mmsi,
        r.v,
        r.olon, r.olat, r.dlon, r.dlat,
        date_trunc('hour', now()) - ((335 - i) * INTERVAL '1 hour') AS ts,
        -- How far along the route this vessel is at this hour. Each vessel gets
        -- its own start phase (golden-ratio spread) and pace, so at any instant
        -- ships are scattered along their routes — most out in open ocean —
        -- instead of all sitting at the origin/destination port.
        (r.v * 0.6180339887::float8
            + (i::float8 / 335.0) * (0.5 + (r.v % 7) * 0.15)) AS travel
    FROM routes r
    CROSS JOIN generate_series(0, 335) AS i
),
samples AS (
    SELECT
        p.mmsi,
        p.ts,
        -- wrap travel into [0,1) and interpolate origin -> destination
        (p.olon + (p.dlon - p.olon) * (p.travel - floor(p.travel)))::float8 AS base_lon,
        (p.olat + (p.dlat - p.olat) * (p.travel - floor(p.travel)))::float8 AS base_lat,
        -- Per-vessel offset on a phyllotaxis spiral: distinct per vessel and
        -- ~15 m between neighbours, so co-routed ships fan out instead of
        -- stacking on one point. radius in metres, angle in radians.
        (9.0 * sqrt(p.v::float8)) AS off_r,
        (p.v * 2.399963229728653::float8) AS off_theta,
        round(
            mod(
                (degrees(atan2(
                    sin(radians((p.dlon - p.olon)::float8)) * cos(radians(p.dlat::float8)),
                    cos(radians(p.olat::float8)) * sin(radians(p.dlat::float8))
                      - sin(radians(p.olat::float8)) * cos(radians(p.dlat::float8))
                        * cos(radians((p.dlon - p.olon)::float8))
                )) + 360)::numeric,
                360
            ),
            2
        ) AS heading
    FROM positions p
)
SELECT
    mmsi,
    ts,
    ST_SetSRID(
        ST_MakePoint(
            -- metres → degrees (longitude scaled by cos(latitude)).
            base_lon + (off_r * cos(off_theta)) / (111320.0 * cos(radians(base_lat))),
            base_lat + (off_r * sin(off_theta)) / 111320.0
        ),
        4326
    )::geography AS position,
    heading
FROM samples;
SQL

# --- Summary ----------------------------------------------------------------
docker exec -i "${CONTAINER_NAME}" \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT count(*) AS pings,
             count(DISTINCT mmsi) AS vessels,
             min(ts) AS earliest,
             max(ts) AS latest
        FROM ais_pings;"

echo "Done."
