#!/usr/bin/env bash
#
# erase_static_vessel_info.sh — delete all rows from static_vessel_info.
#
# Empties the static_vessel_info table (TRUNCATE) without dropping it, so the
# schema and indexes stay intact. Because ais_pings has a foreign key to
# static_vessel_info, this uses CASCADE — which ALSO empties ais_pings.
#
# This is destructive and asks for confirmation. Skip the prompt with --force/-y
# (e.g. in CI). If the table does not exist, the script reports that and exits 0.
#
# Override the target via environment variables, e.g.:
#   POSTGRES_DB=other DB_CONTAINER_NAME=my-db ./erase_static_vessel_info.sh
#
set -euo pipefail

CONTAINER_NAME="${DB_CONTAINER_NAME:-geo-analytics-db}"
POSTGRES_DB="${POSTGRES_DB:-geo_analytics}"
POSTGRES_USER="${POSTGRES_USER:-geo}"

FORCE=0
for arg in "$@"; do
  case "${arg}" in
    -y|--force) FORCE=1 ;;
    -h|--help)
      echo "Usage: $0 [--force|-y]"
      echo "Deletes all rows from static_vessel_info (and, via CASCADE, ais_pings)."
      exit 0
      ;;
    *)
      echo "Error: unknown argument '${arg}'." >&2
      echo "Usage: $0 [--force|-y]" >&2
      exit 1
      ;;
  esac
done

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

# If the table is absent there is nothing to erase.
table_exists="$(docker exec -i "${CONTAINER_NAME}" \
  psql -tA -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT to_regclass('public.static_vessel_info') IS NOT NULL;")"
if [ "${table_exists}" != "t" ]; then
  echo "Table static_vessel_info does not exist. Nothing to erase."
  exit 0
fi

count="$(docker exec -i "${CONTAINER_NAME}" \
  psql -tA -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT count(*) FROM static_vessel_info;")"

if [ "${count}" = "0" ]; then
  echo "static_vessel_info is already empty. Nothing to erase."
  exit 0
fi

# Dependent ais_pings rows that CASCADE will also remove (0 if table absent).
pings_count="$(docker exec -i "${CONTAINER_NAME}" \
  psql -tA -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT coalesce((SELECT count(*) FROM ais_pings), 0);" 2>/dev/null || echo 0)"

# --- Confirmation -----------------------------------------------------------
if [ "${FORCE}" -ne 1 ]; then
  printf "This will delete %s vessel(s) from static_vessel_info (and %s ais_pings via CASCADE) in '%s'. Continue? [y/N] " \
    "${count}" "${pings_count}" "${POSTGRES_DB}"
  read -r reply
  case "${reply}" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 0 ;;
  esac
fi

echo "Erasing ${count} vessel(s) from static_vessel_info (CASCADE)..."

docker exec -i "${CONTAINER_NAME}" \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "TRUNCATE TABLE static_vessel_info CASCADE;"

echo "Done. static_vessel_info is now empty."
