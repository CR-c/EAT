#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

RELEASE_ROOT="${RELEASE_ROOT:-/opt/eat/releases}"
CURRENT_LINK="${CURRENT_LINK:-/opt/eat/current}"
RELEASE_ID="${RELEASE_ID:-$(date -u +%Y%m%d%H%M%S)}"
RELEASE_DIR="${RELEASE_ROOT}/${RELEASE_ID}"
SYSTEMD_UNIT_PATH="${SYSTEMD_UNIT_PATH:-/etc/systemd/system/eat.service}"
SYSTEMD_ENV_PATH="${SYSTEMD_ENV_PATH:-/etc/eat/eat.env}"
NGINX_SITE_PATH="${NGINX_SITE_PATH:-/etc/nginx/sites-available/eat.conf}"
NGINX_SITE_LINK="${NGINX_SITE_LINK:-/etc/nginx/sites-enabled/eat.conf}"
INSTALL_SYSTEM_ASSETS="${INSTALL_SYSTEM_ASSETS:-0}"
RESTART_SERVICE="${RESTART_SERVICE:-0}"
BUILD_WORKER_IMAGE="${BUILD_WORKER_IMAGE:-1}"
WORKER_IMAGE_TAG="${WORKER_IMAGE_TAG:-eat/worker-base:latest}"

require_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "missing required command: $1" >&2
        exit 1
    fi
}

require_cmd go
require_cmd pnpm

if [[ "${BUILD_WORKER_IMAGE}" == "1" ]]; then
    require_cmd docker
fi

mkdir -p "${RELEASE_DIR}/backend" "${RELEASE_DIR}/web" "${RELEASE_DIR}/prisma" "${RELEASE_DIR}/deploy" "${RELEASE_DIR}/scripts"

echo "==> Building web UI"
(
    cd "${REPO_ROOT}/web"
    pnpm install --frozen-lockfile
    pnpm build
)

echo "==> Building backend binary"
(
    cd "${REPO_ROOT}/backend"
    go build -o "${RELEASE_DIR}/backend/eat-backend" ./cmd/eat
)

echo "==> Staging release files into ${RELEASE_DIR}"
cp -R "${REPO_ROOT}/web/dist" "${RELEASE_DIR}/web/dist"
cp -R "${REPO_ROOT}/prisma/migrations" "${RELEASE_DIR}/prisma/migrations"
cp -R "${REPO_ROOT}/deploy/." "${RELEASE_DIR}/deploy/"
cp -R "${REPO_ROOT}/scripts/." "${RELEASE_DIR}/scripts/"
chmod +x "${RELEASE_DIR}/scripts/"*.sh

if [[ "${BUILD_WORKER_IMAGE}" == "1" ]]; then
    echo "==> Building worker image ${WORKER_IMAGE_TAG}"
    docker build -t "${WORKER_IMAGE_TAG}" -f "${REPO_ROOT}/docker/worker-base/Dockerfile" "${REPO_ROOT}"
fi

ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"

if [[ "${INSTALL_SYSTEM_ASSETS}" == "1" ]]; then
    echo "==> Installing systemd and nginx assets"
    mkdir -p "$(dirname "${SYSTEMD_UNIT_PATH}")" "$(dirname "${SYSTEMD_ENV_PATH}")" "$(dirname "${NGINX_SITE_PATH}")" "$(dirname "${NGINX_SITE_LINK}")"
    cp "${REPO_ROOT}/deploy/systemd/eat.service" "${SYSTEMD_UNIT_PATH}"
    if [[ ! -f "${SYSTEMD_ENV_PATH}" ]]; then
        cp "${REPO_ROOT}/deploy/systemd/eat.env.example" "${SYSTEMD_ENV_PATH}"
    fi
    cp "${REPO_ROOT}/deploy/nginx/eat.conf" "${NGINX_SITE_PATH}"
    ln -sfn "${NGINX_SITE_PATH}" "${NGINX_SITE_LINK}"

    if command -v systemctl >/dev/null 2>&1; then
        systemctl daemon-reload
    fi
    if command -v nginx >/dev/null 2>&1; then
        nginx -t
    fi
fi

if [[ "${RESTART_SERVICE}" == "1" ]]; then
    if ! command -v systemctl >/dev/null 2>&1; then
        echo "systemctl is required when RESTART_SERVICE=1" >&2
        exit 1
    fi
    systemctl restart eat
fi

cat <<EOF
Release prepared successfully.
Release ID: ${RELEASE_ID}
Release dir: ${RELEASE_DIR}
Current link: ${CURRENT_LINK}

Next steps:
  1. Review /etc/eat/eat.env
  2. systemctl enable --now eat
  3. journalctl -u eat -f
EOF
