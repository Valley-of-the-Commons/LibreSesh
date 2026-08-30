#!/bin/sh
# Fix the data volume's ownership, then drop privileges and exec the app.
#
# A volume is attached *over* the image's /data at start-up, so the
# `chown` in the Dockerfile applies to a directory the mount then covers.
# Platforms hand that volume over root-owned, so a container that starts as an
# unprivileged user cannot create the database in it — better-sqlite3 reports
# this as `SQLITE_CANTOPEN`, which says nothing about ownership.
#
# So: start as root, chown what the mount brought, and drop to `node` for the
# app itself. The alternative — running the whole app as root — is what the
# platform-specific escape hatches (RAILWAY_RUN_UID=0 and friends) get you, and
# it is strictly worse.
#
# `exec` twice over, so the Node process ends up as PID 1 and receives SIGTERM
# directly; the graceful shutdown in server/src/index.ts depends on it.
set -e

DATA_DIR="$(dirname "${DATABASE_PATH:-/data/app.db}")"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  # Only the volume, never the whole app tree: a large volume makes this slow,
  # and -R over /app would be pointless work on every single start.
  chown -R node:node "$DATA_DIR"
  exec gosu node "$@"
fi

# Already unprivileged — nothing to fix and no way to fix it. The preflight
# check reports it properly if the directory turns out not to be writable.
exec "$@"
