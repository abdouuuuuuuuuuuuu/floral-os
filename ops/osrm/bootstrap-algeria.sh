#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/data"
PBF_FILE="${DATA_DIR}/algeria-latest.osm.pbf"
IMAGE="ghcr.io/project-osrm/osrm-backend:26.10.0-debian"
MARKER="${DATA_DIR}/.processed-v26.10.0-mld"
PBF_URL="https://download.geofabrik.de/africa/algeria-latest.osm.pbf"

mkdir -p "${DATA_DIR}"

if [[ ! -s "${PBF_FILE}" ]]; then
  echo "Downloading Algeria OpenStreetMap extract..."
  curl --fail --location --retry 5 --retry-delay 2 --output "${PBF_FILE}.part" "${PBF_URL}"
  if [[ ! -s "${PBF_FILE}.part" ]]; then
    echo "The Algeria map download is empty; stopping." >&2
    exit 1
  fi
  mv "${PBF_FILE}.part" "${PBF_FILE}"
fi

docker pull "${IMAGE}"

if [[ ! -f "${MARKER}" ]]; then
  echo "Preparing the Algeria driving graph. This can take a while."
  docker run --rm --mount "type=bind,source=${DATA_DIR},target=/data" "${IMAGE}" \
    osrm-extract -p /opt/car.lua /data/algeria-latest.osm.pbf
  docker run --rm --mount "type=bind,source=${DATA_DIR},target=/data" "${IMAGE}" \
    osrm-partition /data/algeria-latest.osrm
  docker run --rm --mount "type=bind,source=${DATA_DIR},target=/data" "${IMAGE}" \
    osrm-customize /data/algeria-latest.osrm
  touch "${MARKER}"
fi

echo "OSRM graph is ready. Start it with: docker compose up -d"
