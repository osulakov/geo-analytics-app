#!/usr/bin/env bash
#
# ais_off_mock.sh — generate mock "ais_off" events.
#
# Picks 1000 random vessels that have pings, takes each one's most recent ping,
# and writes an 'ais_off' event at that vessel's last-known time/position. This
# mocks an AIS dropout: the point where a vessel was last seen before going dark.
#
# Each event is written to the `events` table as:
#   mmsi, event_type='ais_off', ts (last ping time), position (last ping point),
#   details = { "last_seen": <ts> }.
#
# Re-runnable: clears existing 'ais_off' events first.
#
set -euo pipefail

CONTAINER_NAME="${DB_CONTAINER_NAME:-geo-analytics-db}"
POSTGRES_DB="${POSTGRES_DB:-geo_analytics}"
POSTGRES_USER="${POSTGRES_USER:-geo}"
EVENT_COUNT="${AIS_OFF_COUNT:-1000}"

# --- Preconditions ----------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not on PATH." >&2
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

ping_count="$(docker exec -i "${CONTAINER_NAME}" \
  psql -tA -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT count(*) FROM ais_pings;" 2>/dev/null || echo 0)"
if [ "${ping_count}" = "0" ]; then
  echo "Error: ais_pings is empty. Seed it with data_scripts/two_weeks_pings_from_now.sh" >&2
  exit 1
fi

echo "Generating up to ${EVENT_COUNT} mock 'ais_off' events..."

docker exec -i "${CONTAINER_NAME}" \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -v event_count="${EVENT_COUNT}" <<'SQL'
CREATE TABLE IF NOT EXISTS events (
    id         BIGSERIAL PRIMARY KEY,
    mmsi       VARCHAR(9) NOT NULL,
    event_type TEXT NOT NULL,
    subtype    TEXT,
    ts         TIMESTAMPTZ NOT NULL,
    position   GEOGRAPHY(Point, 4326) NOT NULL,
    details    JSONB
);
ALTER TABLE events ADD COLUMN IF NOT EXISTS details JSONB;
CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts);
CREATE INDEX IF NOT EXISTS events_position_gix ON events USING GIST (position);

-- Rebuild this event type from scratch.
DELETE FROM events WHERE event_type = 'ais_off';

INSERT INTO events (mmsi, event_type, subtype, ts, position, details)
WITH latest AS (
    SELECT DISTINCT ON (mmsi) mmsi, ts, position
    FROM ais_pings
    ORDER BY mmsi, ts DESC
),
picked AS (
    SELECT mmsi, ts, position
    FROM latest
    ORDER BY random()
    LIMIT :event_count
)
SELECT
    mmsi,
    'ais_off',
    NULL,
    ts,
    position,
    jsonb_build_object('last_seen', ts)
FROM picked;
SQL

# --- Summary ----------------------------------------------------------------
docker exec -i "${CONTAINER_NAME}" \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT count(*) AS ais_off_events FROM events WHERE event_type = 'ais_off';"

echo "Done."
