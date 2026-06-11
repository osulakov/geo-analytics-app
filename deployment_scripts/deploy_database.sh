#!/usr/bin/env bash
#
# deploy_database.sh — spin up a local Postgres (PostGIS) database in Docker.
#
# Idempotent: creates the container the first time, and just (re)starts it on
# subsequent runs. Data is persisted in a named Docker volume.
#
# All settings can be overridden via environment variables, e.g.:
#   DB_PORT=5433 POSTGRES_PASSWORD=secret ./deploy_database.sh
#   DB_IMAGE=postgres:16 ./deploy_database.sh   # plain Postgres, no PostGIS
#
set -euo pipefail

# --- Configuration (override via environment) -------------------------------
CONTAINER_NAME="${DB_CONTAINER_NAME:-geo-analytics-db}"
IMAGE="${DB_IMAGE:-postgis/postgis:16-3.4}"
HOST_PORT="${DB_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-geo_analytics}"
POSTGRES_USER="${POSTGRES_USER:-geo}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-geo_dev_password}"
VOLUME_NAME="${DB_VOLUME:-geo-analytics-db-data}"

# --- Preconditions ----------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not on PATH." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Error: the Docker daemon is not running. Start Docker and retry." >&2
  exit 1
fi

# --- Create or (re)start the container --------------------------------------
if docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  if docker ps --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
    echo "Container '${CONTAINER_NAME}' is already running."
  else
    echo "Starting existing container '${CONTAINER_NAME}'..."
    docker start "${CONTAINER_NAME}" >/dev/null
  fi
else
  echo "Creating database container '${CONTAINER_NAME}' from ${IMAGE}..."
  docker run -d \
    --name "${CONTAINER_NAME}" \
    -e POSTGRES_DB="${POSTGRES_DB}" \
    -e POSTGRES_USER="${POSTGRES_USER}" \
    -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    -p "${HOST_PORT}:5432" \
    -v "${VOLUME_NAME}:/var/lib/postgresql/data" \
    --restart unless-stopped \
    "${IMAGE}" >/dev/null
fi

# --- Wait until Postgres accepts connections --------------------------------
printf 'Waiting for Postgres to be ready'
ready=false
for _ in $(seq 1 30); do
  if docker exec "${CONTAINER_NAME}" pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
    ready=true
    break
  fi
  printf '.'
  sleep 1
done
echo

if [ "${ready}" != "true" ]; then
  echo "Error: Postgres did not become ready in time." >&2
  echo "Check logs with: docker logs ${CONTAINER_NAME}" >&2
  exit 1
fi

# --- Enable PostGIS (no-op if unavailable or already present) ---------------
docker exec "${CONTAINER_NAME}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;" >/dev/null 2>&1 \
  && echo "PostGIS extension enabled." \
  || echo "Note: could not enable PostGIS (image may be plain Postgres) — skipping."

# --- Summary ----------------------------------------------------------------
cat <<EOF

Database is up:
  Host:     localhost
  Port:     ${HOST_PORT}
  Database: ${POSTGRES_DB}
  User:     ${POSTGRES_USER}
  Password: ${POSTGRES_PASSWORD}

  Connection string:
    postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${HOST_PORT}/${POSTGRES_DB}

Useful commands:
  Logs:  docker logs -f ${CONTAINER_NAME}
  Shell: docker exec -it ${CONTAINER_NAME} psql -U ${POSTGRES_USER} -d ${POSTGRES_DB}
  Stop:  docker stop ${CONTAINER_NAME}
  Reset: docker rm -f ${CONTAINER_NAME} && docker volume rm ${VOLUME_NAME}
EOF
