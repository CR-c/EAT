#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${EAT_ENV_FILE:-/etc/eat/eat.env}"
if [[ -f "${ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
fi

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/eat}"
TIMESTAMP="$(date -u +%Y%m%d%H%M%S)"
WORK_DIR="$(mktemp -d)"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

DB_PATH="${EAT_BACKEND_DB_PATH:-/var/lib/eat/data/eat.db}"
UPLOAD_ROOT="${EAT_UPLOAD_ROOT:-/var/lib/eat/uploads}"
ENV_SNAPSHOT="${ENV_SNAPSHOT:-${ENV_FILE}}"
ARCHIVE_PATH="${BACKUP_ROOT}/eat-${TIMESTAMP}.tar.gz"

cleanup() {
    rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

mkdir -p "${BACKUP_ROOT}" "${WORK_DIR}/db"

if [[ -f "${DB_PATH}" ]]; then
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "${DB_PATH}" ".backup '${WORK_DIR}/db/eat.db'"
    else
        cp "${DB_PATH}" "${WORK_DIR}/db/eat.db"
        if [[ -f "${DB_PATH}-wal" ]]; then
            cp "${DB_PATH}-wal" "${WORK_DIR}/db/eat.db-wal"
        fi
        if [[ -f "${DB_PATH}-shm" ]]; then
            cp "${DB_PATH}-shm" "${WORK_DIR}/db/eat.db-shm"
        fi
    fi
fi

if [[ -d "${UPLOAD_ROOT}" ]]; then
    cp -R "${UPLOAD_ROOT}" "${WORK_DIR}/uploads"
fi

if [[ -f "${ENV_SNAPSHOT}" ]]; then
    mkdir -p "${WORK_DIR}/config"
    cp "${ENV_SNAPSHOT}" "${WORK_DIR}/config/eat.env"
fi

cat > "${WORK_DIR}/manifest.txt" <<EOF
created_at_utc=${TIMESTAMP}
db_path=${DB_PATH}
upload_root=${UPLOAD_ROOT}
host=$(hostname)
EOF

tar -C "${WORK_DIR}" -czf "${ARCHIVE_PATH}" .
find "${BACKUP_ROOT}" -maxdepth 1 -type f -name 'eat-*.tar.gz' -mtime +"${RETENTION_DAYS}" -delete

echo "Backup written to ${ARCHIVE_PATH}"
