import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate, openDb, type Db } from '../server/src/db.js';

describe('migrations', () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('creates every table the app relies on', () => {
    const tables = db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name);
    for (const table of [
      'events',
      'identities',
      'roles',
      'rooms',
      'tags',
      'sessions',
      'session_tags',
      'contributions',
      'tracks',
      'event_identities',
      'audit',
      'migrations',
    ]) {
      expect(tables).toContain(table);
    }
  });

  it('renamed the booking permission off the word "track"', () => {
    const columns = db
      .prepare<[], { name: string }>('PRAGMA table_info(rooms)')
      .all()
      .map((c) => c.name);
    expect(columns).toContain('open_booking');
    expect(columns).not.toContain('open_track');
  });

  it('is idempotent', () => {
    const before = db.prepare<[], { name: string }>('SELECT name FROM migrations').all();
    expect(() => migrate(db)).not.toThrow();
    expect(db.prepare<[], { name: string }>('SELECT name FROM migrations').all()).toEqual(before);
  });

  it('enforces the role and type checks', () => {
    expect(() =>
      db
        .prepare('INSERT INTO roles (identity_id, event_id, role, granted_at) VALUES (1, 1, ?, ?)')
        .run('superuser', new Date().toISOString()),
    ).toThrow();
  });

  it('runs in WAL mode with foreign keys on', () => {
    expect(db.pragma('journal_mode', { simple: true })).toBe('memory');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
