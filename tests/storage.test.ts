import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDurableStorage, ephemeralStorageMessage, isMountPoint } from '../server/src/storage.js';

const dirs: string[] = [];
const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'libresesh-storage-'));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('durable storage check', () => {
  it('treats an ordinary directory as not a mount point', () => {
    const dir = join(scratch(), 'data');
    mkdirSync(dir);
    expect(isMountPoint(dir)).toBe(false);
  });

  // The exact shape of the Railway failure: DATABASE_PATH points somewhere
  // that does not exist yet, openDb would create it, and it would not persist.
  it('treats a directory that does not exist yet as not a mount point', () => {
    expect(isMountPoint(join(scratch(), 'never-created'))).toBe(false);
  });

  it('treats the filesystem root as a mount point', () => {
    expect(isMountPoint('/')).toBe(true);
  });

  it('reports the directory holding the database file', () => {
    const dir = scratch();
    const check = checkDurableStorage(join(dir, 'app.db'));
    expect(check.directory).toBe(dir);
    expect(check.durable).toBe(false);
  });

  it('names the path and both escape hatches in the failure message', () => {
    const message = ephemeralStorageMessage('/data');
    expect(message).toContain('/data');
    expect(message).toContain('ALLOW_EPHEMERAL_DB=1');
    expect(message).toContain('DATABASE_PATH');
  });
});
