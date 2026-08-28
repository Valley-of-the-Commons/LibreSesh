#!/usr/bin/env bash
# Nightly backup. VACUUM INTO is safe against a live WAL database.
#
#   0 3 * * *  /srv/opengrid/deploy/backup.sh >> /var/log/opengrid-backup.log 2>&1
#
set -euo pipefail

DATABASE_PATH="${DATABASE_PATH:-/srv/opengrid/data/app.db}"
BACKUP_DIR="${BACKUP_DIR:-/srv/opengrid/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
target="$BACKUP_DIR/app-$(date +%F).db"

sqlite3 "$DATABASE_PATH" "VACUUM INTO '$target'"
echo "$(date -Is) wrote $target ($(du -h "$target" | cut -f1))"

# Keep the last N days.
find "$BACKUP_DIR" -name 'app-*.db' -mtime "+$RETENTION_DAYS" -delete
