#!/usr/bin/env bash
# Idempotent host-side deploy for the non-Coolify compose stacks at
# /opt/aiqadam/<stack>/. Called by .github/workflows/deploy-web-next.yml
# after the workflow has rsync'd the repo into the `source/` directory.
#
# Why this exists: PR-0c and PR-0d both had to manually SSH in to
# refresh /opt/aiqadam/web-next/source/ and `docker compose up -d
# --build`. This script + the workflow that calls it make that
# automatic on every push to main.
#
# Usage (on prod host, runs as aiqadam-admin which has NOPASSWD: ALL):
#   bash deploy.sh web-next
#   bash deploy.sh storybook
#
# The named stack must already exist under /opt/aiqadam/<stack>/ with a
# docker-compose.yml file present — the workflow rsync's the new repo
# into /opt/aiqadam/<stack>/source/ before invoking this script, so we
# never bootstrap a fresh stack from here. Bootstrap is still manual
# (see header of each infrastructure/<stack>/docker-compose.yml).

set -euo pipefail

readonly STACK="${1:?stack name required: web-next or storybook}"
readonly STACK_DIR="/opt/aiqadam/${STACK}"
readonly COMPOSE_FILE="${STACK_DIR}/docker-compose.yml"
readonly REPO_COMPOSE="${STACK_DIR}/source/infrastructure/${STACK}/docker-compose.yml"

# Sanity: the stack dir, the running compose file, and the just-rsync'd
# repo source must all exist. If any is missing, fail loud — recovery is
# a manual bootstrap, not retry.
if [[ ! -d "${STACK_DIR}" ]]; then
  echo "ERROR: ${STACK_DIR} does not exist — stack not bootstrapped" >&2
  exit 1
fi
if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "ERROR: ${COMPOSE_FILE} missing — stack not bootstrapped" >&2
  exit 1
fi
if [[ ! -f "${REPO_COMPOSE}" ]]; then
  echo "ERROR: ${REPO_COMPOSE} missing from rsync'd source" >&2
  exit 1
fi

# Keep the running docker-compose.yml in sync with the version checked
# into the repo. Compose labels and env shape changes ride along with
# the rest of the source tree on every deploy.
if ! sudo cmp -s "${REPO_COMPOSE}" "${COMPOSE_FILE}"; then
  echo "Updating ${COMPOSE_FILE} from repo copy..."
  sudo cp "${REPO_COMPOSE}" "${COMPOSE_FILE}"
fi

# Build + restart. --build forces a rebuild of the application image
# from the new source; --no-deps because these stacks have no compose
# service dependencies on each other.
cd "${STACK_DIR}"
sudo docker compose up -d --build

# Confirm the container came back healthy. Compose returns 0 even for
# crashlooping containers if it managed to call the API, so explicitly
# read state. We accept "running" — "restarting" or "exited" fails the
# deploy.
readonly CONTAINER="aiqadam-${STACK}-${STACK}-1"
STATE=$(sudo docker inspect --format '{{.State.Status}}' "${CONTAINER}")
echo "${CONTAINER} state: ${STATE}"
if [[ "${STATE}" != "running" ]]; then
  echo "ERROR: ${CONTAINER} is not running (state=${STATE})" >&2
  sudo docker logs --tail 50 "${CONTAINER}" >&2 || true
  exit 1
fi

echo "Deploy of ${STACK} OK."
