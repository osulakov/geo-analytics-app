#!/usr/bin/env bash
#
# 3_days_pings_from_now.sh — fill ais_pings with 3 days of pings.
#
# For every vessel in static_vessel_info, generates one ping every 3 hours for
# the last 3 days (one ping per 3 h, ending at the current hour). Vessels split
# 50/50:
#   * even-indexed vessels are docked at a port anchorage, clustered ~15 m
#     apart (phyllotaxis spiral) so they don't stack on one point;
#   * odd-indexed vessels are scattered across open ocean and drift slowly
#     along a fixed heading.
# All positions are sampled in water, so ships never appear on land.
#
# Each ping has only: mmsi, ts (timestamp), position (PostGIS point), heading.
#
# Water areas / port anchorages are inspired by data_scripts/aois.md, but use
# clean open-water boxes and offshore anchorages: the file's SEA entries are
# bounding boxes that include coastline, and the Arctic/Southern/Pacific ocean
# polygons enclose land or cross the antimeridian.
#
# This REPLACES any existing rows in ais_pings (truncates first). Targets the
# container from deployment_scripts/deploy_database.sh.
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

echo "Generating 3 days of pings for ${vessel_count} vessel(s)..."

docker exec -i "${CONTAINER_NAME}" \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" <<'SQL'
CREATE TABLE IF NOT EXISTS ais_pings (
    mmsi     VARCHAR(9) NOT NULL REFERENCES static_vessel_info(mmsi) ON DELETE CASCADE,
    ts       TIMESTAMPTZ NOT NULL,
    position GEOGRAPHY(Point, 4326) NOT NULL,
    heading  NUMERIC(5,2),
    speed    NUMERIC(5,2),            -- speed over ground (knots)
    PRIMARY KEY (mmsi, ts)
);
ALTER TABLE ais_pings ADD COLUMN IF NOT EXISTS speed NUMERIC(5,2);
CREATE INDEX IF NOT EXISTS ais_pings_ts_idx ON ais_pings (ts);
CREATE INDEX IF NOT EXISTS ais_pings_position_gix ON ais_pings USING GIST (position);

-- Always (re)build the trailing three-day window.
TRUNCATE TABLE ais_pings;

INSERT INTO ais_pings (mmsi, ts, position, heading, speed)
WITH water(geom) AS (
    -- Open-ocean sampling areas: well offshore, no antimeridian crossings.
    SELECT ST_Collect(ARRAY[
        ST_MakeEnvelope( -45,  30,  -20,  50, 4326),  -- North Atlantic
        ST_MakeEnvelope( -40,   5,  -20,  28, 4326),  -- Central Atlantic
        ST_MakeEnvelope( -30, -35,   -5, -10, 4326),  -- South Atlantic (east)
        ST_MakeEnvelope( -45, -45,  -25, -20, 4326),  -- South Atlantic (west)
        ST_MakeEnvelope(  55, -35,   95,  -5, 4326),  -- South Indian Ocean
        ST_MakeEnvelope(  58,  10,   70,  20, 4326),  -- Arabian Sea
        ST_MakeEnvelope(  84,   8,   93,  17, 4326),  -- Bay of Bengal
        ST_MakeEnvelope( 150, -25,  175,  -5, 4326),  -- SW Pacific
        ST_MakeEnvelope( 150,  20,  175,  40, 4326),  -- NW Pacific
        ST_MakeEnvelope(-150, -30, -120,  -5, 4326),  -- Central South Pacific
        ST_MakeEnvelope(-150,  25, -130,  45, 4326),  -- NE Pacific
        ST_MakeEnvelope(-120, -35,  -95, -10, 4326)   -- SE Pacific
    ]) AS geom
),
-- Offshore anchorage points (in water, just outside the harbour).
ports(idx, lon, lat) AS (
    VALUES
        (0,  122.20,  30.90),  -- Shanghai approach
        (1,  103.80,   1.18),  -- Singapore Strait
        (2,    3.80,  52.00),  -- Rotterdam approach
        (3, -118.15,  33.68),  -- Los Angeles / Long Beach
        (4,  -73.85,  40.45),  -- New York approach
        (5,  114.15,  22.20),  -- Hong Kong anchorage
        (6,  129.10,  35.00),  -- Busan approach
        (7,   54.95,  25.00),  -- Dubai (Jebel Ali)
        (8,  -46.20, -24.10),  -- Santos approach
        (9,   31.15, -29.92),  -- Durban approach
        (10, 151.30, -33.90),  -- Sydney approach
        (11, -79.85,   9.45),  -- Colon (Panama, Caribbean)
        (12,  32.40,  31.40),  -- Port Said / Suez approach
        (13,  23.55,  37.88),  -- Piraeus (Saronic Gulf)
        (14,  72.70,  18.90),  -- Mumbai approach
        (15, 139.85,  35.35),  -- Tokyo Bay
        (16,   3.40,  51.55),  -- Antwerp / Westerschelde mouth
        (17,  -0.10,  39.40),  -- Valencia approach
        (18,  30.85,  46.45),  -- Odessa (Black Sea)
        (19,  -5.50,  36.00)   -- Gibraltar Strait
),
nports AS (
    SELECT count(*)::int AS n FROM ports
),
vessels AS (
    SELECT mmsi, (row_number() OVER (ORDER BY mmsi) - 1)::int AS v
    FROM static_vessel_info
),
hours AS (
    -- i counts hours; step 3 → one ping every 3 hours over the last 3 days.
    SELECT generate_series(0, 72, 3) AS i
),

----------------------------------------------------------------------
-- Ocean half (odd-indexed vessels): scattered in open water, drifting.
----------------------------------------------------------------------
ocean_vessels AS (
    SELECT mmsi, (row_number() OVER (ORDER BY mmsi) - 1)::int AS oi
    FROM vessels
    WHERE v % 2 = 1
),
gen AS (
    -- One random point per ocean vessel, guaranteed inside the water areas.
    SELECT (dp).path[1] AS idx, (dp).geom AS pt
    FROM (
        SELECT ST_Dump(
                   ST_GeneratePoints(w.geom, (SELECT count(*)::int FROM ocean_vessels), 20260611)
               ) AS dp
        FROM water w
    ) s
),
ocean_anchors AS (
    SELECT
        ov.mmsi,
        ST_X(g.pt) AS ax,
        ST_Y(g.pt) AS ay,
        (ov.oi * 137.50776405)::float8        AS bearing,  -- degrees, spread out
        -- Drift in degrees/hour. Per 3-hour step the ground distance is
        -- 180 * speed deg-of-arc → ~3.6–5.4 nm, so consecutive pings are
        -- always >3 miles apart and the 3-day track is clearly visible.
        (0.02 + (ov.oi % 6) * 0.002)::float8  AS speed,
        (8 + (ov.oi % 13))::numeric           AS speed_kn  -- speed over ground (8–20 knots)
    FROM ocean_vessels ov
    JOIN gen g ON g.idx = ov.oi + 1
),
ocean_pings AS (
    SELECT
        a.mmsi,
        date_trunc('hour', now()) - ((72 - h.i) * INTERVAL '1 hour') AS ts,
        ST_MakePoint(
            a.ax + (h.i - 72) * a.speed * sin(radians(a.bearing)) / cos(radians(a.ay)),
            a.ay + (h.i - 72) * a.speed * cos(radians(a.bearing))
        ) AS pt,
        round(mod(a.bearing::numeric, 360), 2) AS heading,
        a.speed_kn AS speed
    FROM ocean_anchors a
    CROSS JOIN hours h
),

----------------------------------------------------------------------
-- Port half (even-indexed vessels): docked, clustered ~15 m apart.
----------------------------------------------------------------------
port_vessels AS (
    SELECT mmsi, (v / 2) AS pv
    FROM vessels
    WHERE v % 2 = 0
),
port_anchors AS (
    SELECT
        pvs.mmsi,
        p.lon AS plon,
        p.lat AS plat,
        -- Phyllotaxis spiral within the port: ~15 m between neighbours.
        (11.0 * sqrt((pvs.pv / np.n)::float8)) AS off_r,        -- metres
        (pvs.pv * 2.399963229728653::float8)   AS off_theta,    -- radians
        (pvs.pv * 137.50776405)::numeric        AS bearing,      -- moored heading
        0::numeric                              AS speed_kn      -- docked
    FROM port_vessels pvs
    CROSS JOIN nports np
    JOIN ports p ON p.idx = pvs.pv % np.n
),
port_pings AS (
    SELECT
        a.mmsi,
        date_trunc('hour', now()) - ((72 - h.i) * INTERVAL '1 hour') AS ts,
        ST_MakePoint(
            a.plon + (a.off_r * cos(a.off_theta)) / (111320.0 * cos(radians(a.plat))),
            a.plat + (a.off_r * sin(a.off_theta)) / 111320.0
        ) AS pt,
        round(mod(a.bearing, 360), 2) AS heading,
        a.speed_kn AS speed
    FROM port_anchors a
    CROSS JOIN hours h
)
SELECT mmsi, ts, ST_SetSRID(pt, 4326)::geography AS position, heading, speed FROM ocean_pings
UNION ALL
SELECT mmsi, ts, ST_SetSRID(pt, 4326)::geography AS position, heading, speed FROM port_pings;
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
