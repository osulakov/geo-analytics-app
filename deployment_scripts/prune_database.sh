#!/usr/bin/env bash
#
# prune_database.sh — completely remove the local database.
#
# Deletes the Docker container AND its data volume, leaving no data behind.
# Re-create with deploy_database.sh and re-seed with the data_scripts.
#
# The Docker image is intentionally kept (avoids a re-download). Skip the
# confirmation prompt with -y / --force or FORCE=1.
#
set -euo pipefail

CONTAINER_NAME="${DB_CONTAINER_NAME:-geo-analytics-db}"
VOLUME_NAME="${DB_VOLUME:-geo-analytics-db-data}"
FORCE="${FORCE:-false}"

for arg in "$@"; do
  case "${arg}" in
    -y | --yes | --force) FORCE=true ;;
    *)
      echo "Unknown argument: ${arg}" >&2
      exit 1
      ;;
  esac
done

# Normalize truthy FORCE values (1/true/yes) to "true".
case "${FORCE}" in
  1 | true | TRUE | yes | YES) FORCE=true ;;
  *) FORCE=false ;;
esac

# --- Preconditions ----------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not on PATH." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Error: the Docker daemon is not running. Start Docker and retry." >&2
  exit 1
fi

# --- Confirm ----------------------------------------------------------------
echo "This will permanently delete:"
echo "  - container: ${CONTAINER_NAME}"
echo "  - volume:    ${VOLUME_NAME} (ALL database data)"
echo

if [ "${FORCE}" != "true" ]; then
  printf "Continue? [y/N] "
  read -r reply || reply=""
  case "${reply}" in
    y | Y | yes | YES) ;;
    *)
      echo "Aborted."
      exit 0
      ;;
  esac
fi

# --- Remove container -------------------------------------------------------
if docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER_NAME}"; then
  echo "Removing container '${CONTAINER_NAME}'..."
  docker rm -f "${CONTAINER_NAME}" >/dev/null
else
  echo "Container '${CONTAINER_NAME}' not found — skipping."
fi

# --- Remove data volume -----------------------------------------------------
if docker volume ls --format '{{.Name}}' | grep -qx "${VOLUME_NAME}"; then
  echo "Removing volume '${VOLUME_NAME}'..."
  docker volume rm "${VOLUME_NAME}" >/dev/null
else
  echo "Volume '${VOLUME_NAME}' not found — skipping."
fi

echo
echo "Database pruned."
echo "  Re-create: deployment_scripts/deploy_database.sh"
echo "  Re-seed:   data_scripts/seed_static_vessel_info.sh"
