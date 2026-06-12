#!/usr/bin/env bash
#
# satellites.sh — create and populate the satellites table.
#
# Generates 100 imaging satellites across two constellations (MAXAR, PLANET),
# 50 each, all on near-polar sun-synchronous orbits averaged from this example:
#
#   {
#     "name": "MAXAR_SIM",
#     "altitudeKm": 617,
#     "inclinationDeg": 97.9,
#     "orbitalPeriodMin": 97,
#     "swathWidthKm": 13,
#     "groundVelocityKmSec": 7.5,
#     "lookAngleDeg": 45
#   }
#
# Orbital period and velocity are derived from the altitude via Kepler's third
# law (μ = 3.986004418e14 m³/s²), so they stay internally consistent and land
# on ~97 min / ~7.5 km/s at 617 km — matching the example. Each constellation
# is spread over 5 orbital planes (RAAN) × 10 phase slots (mean anomaly) so the
# 100 satellites are distinct, evenly distributed points.
#
# Idempotent: creates the table if needed and upserts rows by name, so it can
# be run repeatedly. Targets the Docker container created by
# deployment_scripts/deploy_database.sh.
#
# Override the target via environment variables, e.g.:
#   POSTGRES_DB=other DB_CONTAINER_NAME=my-db ./satellites.sh
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

echo "Seeding satellites in database '${POSTGRES_DB}'..."

docker exec -i "${CONTAINER_NAME}" \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" <<'SQL'
CREATE TABLE IF NOT EXISTS satellites (
    name                   TEXT          PRIMARY KEY,  -- e.g. MAXAR_001
    constellation          TEXT          NOT NULL,     -- MAXAR | PLANET
    altitude_km            NUMERIC(7,2)  NOT NULL,     -- orbit altitude above mean radius
    inclination_deg        NUMERIC(6,3)  NOT NULL,     -- orbital inclination
    orbital_period_min     NUMERIC(7,3)  NOT NULL,     -- time for one orbit
    swath_width_km         NUMERIC(6,2)  NOT NULL,     -- imaging swath on the ground
    ground_velocity_km_sec NUMERIC(6,3)  NOT NULL,     -- orbital velocity
    look_angle_deg         NUMERIC(5,2)  NOT NULL,     -- sensor off-nadir look angle
    raan_deg               NUMERIC(6,2)  NOT NULL,     -- right ascension of ascending node (plane)
    mean_anomaly_deg       NUMERIC(6,2)  NOT NULL      -- phase within the orbit
);
CREATE INDEX IF NOT EXISTS satellites_constellation_idx ON satellites (constellation);

-- 100 satellites: 50 MAXAR + 50 PLANET. For each constellation the 50 sats are
-- laid out as 5 planes (plane = k/10) × 10 phase slots (slot = k%10). Altitude
-- jitters ±10 km around 617; period and velocity follow from it via Kepler.
INSERT INTO satellites
    (name, constellation, altitude_km, inclination_deg, orbital_period_min,
     swath_width_km, ground_velocity_km_sec, look_angle_deg, raan_deg, mean_anomaly_deg)
SELECT
    c.constellation || '_' || lpad((s.k + 1)::text, 3, '0'),
    c.constellation,
    s.alt,
    round((97.9 + (s.plane - 2) * 0.05)::numeric, 3),
    -- T = 2π·√(a³/μ) / 60, a = (6371 + altitude) km in metres.
    round((2 * pi() * sqrt(power((6371 + s.alt) * 1000, 3) / 3.986004418e14) / 60)::numeric, 3),
    round((13 + ((s.k % 3) - 1))::numeric, 2),
    -- v = √(μ/a), in km/s.
    round((sqrt(3.986004418e14 / ((6371 + s.alt) * 1000)) / 1000)::numeric, 3),
    round((45 + ((s.k % 5) - 2) * 2)::numeric, 2),
    -- PLANET planes offset 36° so the two constellations interleave.
    round(((s.plane * 72.0) + CASE WHEN c.constellation = 'PLANET' THEN 36 ELSE 0 END)::numeric, 2),
    round(((s.slot * 36.0) + s.plane * 7.2)::numeric, 2)
FROM (
    SELECT k,
           (k / 10)                       AS plane,
           (k % 10)                       AS slot,
           (617 + ((k % 5) - 2) * 5)::numeric AS alt
    FROM generate_series(0, 49) AS k
) s
CROSS JOIN (VALUES ('MAXAR'), ('PLANET')) AS c(constellation)
ON CONFLICT (name) DO UPDATE SET
    constellation          = EXCLUDED.constellation,
    altitude_km            = EXCLUDED.altitude_km,
    inclination_deg        = EXCLUDED.inclination_deg,
    orbital_period_min     = EXCLUDED.orbital_period_min,
    swath_width_km         = EXCLUDED.swath_width_km,
    ground_velocity_km_sec = EXCLUDED.ground_velocity_km_sec,
    look_angle_deg         = EXCLUDED.look_angle_deg,
    raan_deg               = EXCLUDED.raan_deg,
    mean_anomaly_deg       = EXCLUDED.mean_anomaly_deg;
SQL

# --- Summary ----------------------------------------------------------------
docker exec -i "${CONTAINER_NAME}" \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT constellation,
             count(*)                      AS satellites,
             round(avg(altitude_km), 1)    AS avg_alt_km,
             round(avg(orbital_period_min), 1) AS avg_period_min,
             round(avg(ground_velocity_km_sec), 2) AS avg_vel_km_s
        FROM satellites
       GROUP BY constellation
       ORDER BY constellation;"

echo "Done."
