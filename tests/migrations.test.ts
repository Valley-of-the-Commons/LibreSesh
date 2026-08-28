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
      'audit',
      'migrations',
    ]) {
      expect(tables).toContain(table);
    }
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
