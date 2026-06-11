#!/usr/bin/env bash
#
# seed_static_vessel_info.sh — create and populate the static_vessel_info table.
#
# Idempotent: creates the table if needed and upserts the seed rows by MMSI, so
# it can be run repeatedly. Targets the Docker container created by
# deployment_scripts/deploy_database.sh.
#
# Override the target via environment variables, e.g.:
#   POSTGRES_DB=other DB_CONTAINER_NAME=my-db ./seed_static_vessel_info.sh
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

echo "Seeding static_vessel_info in database '${POSTGRES_DB}'..."

docker exec -i "${CONTAINER_NAME}" \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" <<'SQL'
CREATE TABLE IF NOT EXISTS static_vessel_info (
    mmsi        VARCHAR(9)  PRIMARY KEY,  -- Maritime Mobile Service Identity
    imo         VARCHAR(7),               -- IMO vessel number
    vessel_name TEXT        NOT NULL,     -- Ship name
    callsign    VARCHAR(16),              -- Radio callsign
    flag_state  TEXT,                     -- Country of registration
    vessel_type TEXT,                     -- Cargo, tanker, fishing, passenger, etc.
    length_m    NUMERIC(6,2),             -- Vessel length (metres)
    width_m     NUMERIC(5,2),             -- Vessel beam (metres)
    draft_m     NUMERIC(5,2)              -- Reported draft (metres)
);

INSERT INTO static_vessel_info
    (mmsi, imo, vessel_name, callsign, flag_state, vessel_type, length_m, width_m, draft_m)
VALUES
    ('636092100', '9811000', 'Atlantic Pioneer',  'D5AB2',   'Liberia',          'Container Ship',  300.00, 48.20, 14.50),
    ('538008300', '9745300', 'Pacific Voyager',   'V7AC3',   'Marshall Islands', 'Crude Oil Tanker',250.00, 44.00, 13.20),
    ('215120000', '9402300', 'Mediterranean Star','9HA2100', 'Malta',            'Bulk Carrier',    229.00, 32.30, 12.80),
    ('311045700', '9356700', 'Caribbean Trader',  'C6XY7',   'Bahamas',          'General Cargo',   180.00, 28.00, 10.50),
    ('477553000', '9612300', 'Orient Breeze',     'VRPQ8',   'Hong Kong',        'Container Ship',  334.00, 43.00, 14.80),
    ('235098700', '9501200', 'Northern Aurora',   '2FGH4',   'United Kingdom',   'Passenger',       290.00, 36.00,  8.20),
    ('273345600', '8712300', 'Volga Spirit',      'UAXY',    'Russia',           'Fishing',          95.00, 16.00,  6.40),
    ('244670000', '9388200', 'Holland Dawn',      'PBQR',    'Netherlands',      'Chemical Tanker', 183.00, 32.00, 11.00),
    ('352001230', '9277100', 'Panama Express',    '3EAB9',   'Panama',           'Ro-Ro Cargo',     199.00, 32.20,  9.80),
    ('272019000', '9123400', 'Odessa Mariner',    'UTAB',    'Ukraine',          'Fishing',          78.00, 13.00,  5.20)
ON CONFLICT (mmsi) DO UPDATE SET
    imo         = EXCLUDED.imo,
    vessel_name = EXCLUDED.vessel_name,
    callsign    = EXCLUDED.callsign,
    flag_state  = EXCLUDED.flag_state,
    vessel_type = EXCLUDED.vessel_type,
    length_m    = EXCLUDED.length_m,
    width_m     = EXCLUDED.width_m,
    draft_m     = EXCLUDED.draft_m;

-- 1000 additional synthetic vessels, generated from lookup arrays so the
-- flag state matches the MMSI country prefix (MID). Deterministic MMSI/IMO
-- keep this idempotent: DO NOTHING leaves any existing rows untouched.
INSERT INTO static_vessel_info
    (mmsi, imo, vessel_name, callsign, flag_state, vessel_type, length_m, width_m, draft_m)
SELECT
    (p.mids[1 + (g % 20)] * 1000000 + g)::text,
    (7000000 + g)::text,
    p.adj[1 + (g % 20)] || ' ' || p.noun[1 + ((g / 20) % 20)] || ' ' || g::text,
    chr(65 + (g % 26)) || lpad(g::text, 5, '0'),
    p.flags[1 + (g % 20)],
    p.types[1 + (g % 12)],
    round((50 + random() * 300)::numeric, 2),
    round((10 + random() * 40)::numeric, 2),
    round((4 + random() * 12)::numeric, 2)
FROM
    (SELECT
        ARRAY['Liberia','Panama','Marshall Islands','Malta','Singapore','Hong Kong',
              'Greece','China','Cyprus','Bahamas','United Kingdom','Norway','Japan',
              'Germany','Italy','Netherlands','Denmark','South Korea','Turkey','Ukraine'] AS flags,
        ARRAY[636,351,538,256,565,477,237,412,209,311,232,257,431,211,247,244,219,440,271,272] AS mids,
        ARRAY['Container Ship','Crude Oil Tanker','Bulk Carrier','General Cargo',
              'Chemical Tanker','Passenger','Fishing','Ro-Ro Cargo','Tug',
              'Refrigerated Cargo','LNG Tanker','Vehicle Carrier'] AS types,
        ARRAY['Atlantic','Pacific','Northern','Southern','Eastern','Western','Ocean','Sea',
              'Coastal','Polar','Grand','Royal','Blue','Golden','Silver','Iron','Crystal',
              'Nordic','Adriatic','Aegean'] AS adj,
        ARRAY['Pioneer','Voyager','Star','Trader','Breeze','Aurora','Spirit','Dawn','Express',
              'Mariner','Carrier','Endeavour','Horizon','Navigator','Guardian','Falcon','Pearl',
              'Empress','Sentinel','Phoenix'] AS noun
    ) AS p,
    generate_series(1, 1000) AS g
ON CONFLICT (mmsi) DO NOTHING;
SQL

count="$(docker exec -i "${CONTAINER_NAME}" \
  psql -tA -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT COUNT(*) FROM static_vessel_info;")"

echo "Done. static_vessel_info now has ${count} row(s)."
