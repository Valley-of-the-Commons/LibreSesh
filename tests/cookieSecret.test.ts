import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A cookie secret that changes on restart signs the whole room out — and they
 * cannot re-enter under their own names, because those are still held by the
 * identities they just lost. Keeping the generated one is what stops that.
 */
describe('the cookie secret', () => {
  let dir: string;
  const saved = { ...process.env };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'libresesh-cookie-'));
    delete process.env.COOKIE_SECRET;
    delete process.env.NODE_ENV;
    process.env.DATABASE_PATH = join(dir, 'app.db');
  });
  afterEach(() => {
    process.env = { ...saved };
    rmSync(dir, { recursive: true, force: true });
  });

  const load = async () => (await import('../server/src/config.js')).loadConfig();

  it('is generated once and reused, so a restart keeps everyone signed in', async () => {
    const first = await load();
    const second = await load();
    expect(first.cookieSecret).toBe(second.cookieSecret);
    expect(first.cookieSecretOrigin).toBe('file');
    expect(existsSync(join(dir, '.cookie-secret'))).toBe(true);
  });

  it('keeps it beside the database, readable only by its owner', async () => {
    const config = await load();
    const path = join(dir, '.cookie-secret');
    expect(readFileSync(path, 'utf8')).toBe(config.cookieSecret);
    expect(statSync(path).mode & 0o077).toBe(0);
  });

  it('prefers an explicit one and writes nothing', async () => {
    process.env.COOKIE_SECRET = 'from-the-environment';
    const config = await load();
    expect(config.cookieSecret).toBe('from-the-environment');
    expect(config.cookieSecretOrigin).toBe('env');
    expect(existsSync(join(dir, '.cookie-secret'))).toBe(false);
  });

  it('is required outright in production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(load()).rejects.toThrow(/COOKIE_SECRET/);
  });

  it('stays in memory for an in-memory database, and says so', async () => {
    process.env.DATABASE_PATH = ':memory:';
    const config = await load();
    expect(config.cookieSecretOrigin).toBe('ephemeral');
  });
});
