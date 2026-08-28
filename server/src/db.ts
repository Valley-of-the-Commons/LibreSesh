import Database from 'better-sqlite3';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Db = Database.Database;

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Raw row shapes, mirroring the SQL schema 1:1. */
export interface EventRow {
  id: number;
  slug: string;
  name: string;
  timezone: string;
  start_date: string;
  end_date: string;
  day_start_min: number;
  day_end_min: number;
  viewer_pw_hash: string;
  user_pw_hash: string;
  admin_pw_hash: string;
  archived: number;
  created_at: string;
}

export interface IdentityRow {
  id: number;
  token: string;
  display_name: string;
  created_at: string;
  last_seen_at: string;
}

export interface RoleRow {
  identity_id: number;
  event_id: number;
  role: 'viewer' | 'user' | 'admin';
  granted_at: string;
}

export interface RoomRow {
  id: number;
  event_id: number;
  name: string;
  description: string;
  capacity: number | null;
  open_track: number;
  sort_order: number;
  deleted_at: string | null;
}

export interface TagRow {
  id: number;
  event_id: number;
  name: string;
  color: string;
  deleted_at: string | null;
}

export interface SessionRow {
  id: number;
  event_id: number;
  room_id: number;
  type: 'official' | 'open';
  title: string;
  description: string;
  speaker: string;
  starts_at: string;
  ends_at: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ContributionRow {
  id: number;
  session_id: number;
  kind: 'note' | 'link' | 'question';
  body: string;
  url: string | null;
  created_by: number;
  created_at: string;
  hidden: number;
  deleted_at: string | null;
}

/**
 * Open the SQLite file (creating parent dirs) and bring it up to date.
 * Exactly one process may own a given DB file — see SPEC §10.1.
 */
export function openDb(databasePath: string): Db {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

/** Apply numbered .sql files in order, once each, tracked in `migrations`. */
export function migrate(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    db.prepare<[], { name: string }>('SELECT name FROM migrations').all().map((r) => r.name),
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const record = db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)');
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      record.run(file, new Date().toISOString());
    })();
  }
}
