#!/usr/bin/env bash
# Nightly backup. VACUUM INTO is safe against a live WAL database.
#
#   0 3 * * *  /srv/libresesh/deploy/backup.sh >> /var/log/libresesh-backup.log 2>&1
#
set -euo pipefail

DATABASE_PATH="${DATABASE_PATH:-/srv/libresesh/data/app.db}"
BACKUP_DIR="${BACKUP_DIR:-/srv/libresesh/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
target="$BACKUP_DIR/app-$(date +%F).db"

sqlite3 "$DATABASE_PATH" "VACUUM INTO '$target'"
echo "$(date -Is) wrote $target ($(du -h "$target" | cut -f1))"

# Keep the last N days.
find "$BACKUP_DIR" -name 'app-*.db' -mtime "+$RETENTION_DAYS" -delete
