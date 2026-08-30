import Database from 'better-sqlite3';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate, type Db } from '../server/src/db.js';

/** The runner itself, against throwaway migration dirs — not the real schema. */
describe('migration runner', () => {
  let dir: string;
  let dbPath: string;
  let db: Db;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'libresesh-runner-'));
    dbPath = join(dir, 'app.db');
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (name: string, sql: string) => writeFileSync(join(dir, name), sql);
  const backups = () => readdirSync(dir).filter((f) => f.includes('.backup-'));

  it('refuses to run against a database from a newer build', () => {
    write('001_a.sql', 'CREATE TABLE a (id INTEGER PRIMARY KEY);');
    migrate(db, dir);
    db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)').run(
      '002_from_the_future.sql',
      new Date().toISOString(),
    );
    expect(() => migrate(db, dir)).toThrow(/002_from_the_future\.sql/);
  });

  it('backs up an established database before pending migrations, but not a fresh one', () => {
    write('001_a.sql', 'CREATE TABLE a (id INTEGER PRIMARY KEY);');
    migrate(db, dir);
    expect(backups()).toHaveLength(0); // fresh DB: nothing worth copying

    write('002_b.sql', 'CREATE TABLE b (id INTEGER PRIMARY KEY);');
    migrate(db, dir);
    expect(backups()).toHaveLength(1);

    // The backup is the pre-migration state: table b is not in it.
    const copy = new Database(join(dir, backups()[0]!));
    const tables = copy
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name);
    copy.close();
    expect(tables).toContain('a');
    expect(tables).not.toContain('b');

    migrate(db, dir); // nothing pending → no new backup
    expect(backups()).toHaveLength(1);
  });

  it('can rebuild a table other tables reference, with foreign keys back on after', () => {
    write(
      '001_a.sql',
      `CREATE TABLE parent (id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('x')));
       CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id));
       INSERT INTO parent (id, kind) VALUES (1, 'x');
       INSERT INTO child (id, parent_id) VALUES (1, 1);`,
    );
    migrate(db, dir);

    // The CHECK-widening dance: rebuild parent under the same name.
    write(
      '002_widen.sql',
      `CREATE TABLE parent_new (id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('x','y')));
       INSERT INTO parent_new SELECT id, kind FROM parent;
       DROP TABLE parent;
       ALTER TABLE parent_new RENAME TO parent;`,
    );
    migrate(db, dir);

    expect(() => db.prepare("INSERT INTO parent (kind) VALUES ('y')").run()).not.toThrow();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    // The child row still points at a parent that exists.
    expect((db.pragma('foreign_key_check') as unknown[]).length).toBe(0);
  });

  it('rolls back a migration that leaves foreign keys broken', () => {
    write(
      '001_a.sql',
      `CREATE TABLE parent (id INTEGER PRIMARY KEY);
       CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id));
       INSERT INTO parent (id) VALUES (1);
       INSERT INTO child (id, parent_id) VALUES (1, 1);`,
    );
    migrate(db, dir);

    write('002_bad.sql', 'DROP TABLE parent;'); // orphans child.parent_id
    expect(() => migrate(db, dir)).toThrow(/broken foreign key/);

    // The transaction rolled back: parent still exists, 002 is not recorded.
    expect(db.prepare('SELECT COUNT(*) AS n FROM parent').get()).toEqual({ n: 1 });
    const names = db
      .prepare<[], { name: string }>('SELECT name FROM migrations')
      .all()
      .map((r) => r.name);
    expect(names).toEqual(['001_a.sql']);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });
});
