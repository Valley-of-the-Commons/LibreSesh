import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atLeast, roleForPassword } from '../server/src/auth.js';
import type { EventRow } from '../server/src/db.js';
import { agentFor, makeHarness, seedEvent, type Harness } from './helpers.js';

describe('role ranking', () => {
  it('orders viewer < user < admin', () => {
    expect(atLeast('admin', 'viewer')).toBe(true);
    expect(atLeast('admin', 'admin')).toBe(true);
    expect(atLeast('user', 'admin')).toBe(false);
    expect(atLeast('viewer', 'user')).toBe(false);
    expect(atLeast('viewer', 'viewer')).toBe(true);
  });
});

describe('password matching', () => {
  let harness: Harness;
  let event: EventRow;

  beforeEach(() => {
    harness = makeHarness();
    seedEvent(harness.db);
    event = harness.db
      .prepare<[string], EventRow>('SELECT * FROM events WHERE slug = ?')
      .get('testconf') as EventRow;
  });
  afterEach(() => harness.close());

  it('maps each password to its role', () => {
    expect(roleForPassword(event, 'viewer-pw')).toBe('viewer');
    expect(roleForPassword(event, 'user-pw')).toBe('user');
    expect(roleForPassword(event, 'admin-pw')).toBe('admin');
  });

  it('returns undefined for a wrong password', () => {
    expect(roleForPassword(event, 'nope')).toBeUndefined();
  });

  it('prefers the highest role when two passwords are the same', () => {
    harness.db
      .prepare('UPDATE events SET viewer_pw_hash = admin_pw_hash WHERE id = ?')
      .run(event.id);
    const updated = harness.db
      .prepare<[number], EventRow>('SELECT * FROM events WHERE id = ?')
      .get(event.id) as EventRow;
    expect(roleForPassword(updated, 'admin-pw')).toBe('admin');
  });
});

describe('identity', () => {
  let harness: Harness;
  beforeEach(() => {
    harness = makeHarness();
    seedEvent(harness.db);
  });
  afterEach(() => harness.close());

  it('mints an anonymous identity on first contact and keeps it', async () => {
    const agent = agentFor(harness);
    const first = await agent.get('/api/me').expect(200);
    expect(first.body.displayName).toMatch(/^attendee_[a-z0-9]{5}$/);
    expect(first.body.roles).toEqual({});

    const second = await agent.get('/api/me').expect(200);
    expect(second.body.id).toBe(first.body.id);
  });

  it('gives different visitors different identities', async () => {
    const a = await agentFor(harness).get('/api/me').expect(200);
    const b = await agentFor(harness).get('/api/me').expect(200);
    expect(a.body.id).not.toBe(b.body.id);
  });

  it('renames, including for viewers', async () => {
    const agent = agentFor(harness);
    await agent.get('/api/me');
    await agent.post('/api/e/testconf/auth').send({ password: 'viewer-pw' }).expect(200);
    const res = await agent.patch('/api/me').send({ displayName: '  Dana  ' }).expect(200);
    expect(res.body.displayName).toBe('Dana');
    expect(res.body.roles).toEqual({ testconf: 'viewer' });
  });

  it('rejects an empty or overlong display name', async () => {
    const agent = agentFor(harness);
    await agent.get('/api/me');
    await agent.patch('/api/me').send({ displayName: '   ' }).expect(400);
    await agent.patch('/api/me').send({ displayName: 'x'.repeat(41) }).expect(400);
  });
});

describe('event auth endpoint', () => {
  let harness: Harness;
  beforeEach(() => {
    harness = makeHarness();
    seedEvent(harness.db);
  });
  afterEach(() => harness.close());

  it('grants the matching role', async () => {
    const agent = agentFor(harness);
    const res = await agent.post('/api/e/testconf/auth').send({ password: 'user-pw' }).expect(200);
    expect(res.body).toEqual({ role: 'user' });
  });

  it('403s on a wrong password', async () => {
    const res = await agentFor(harness)
      .post('/api/e/testconf/auth')
      .send({ password: 'wrong' })
      .expect(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('upgrades and downgrades the stored role', async () => {
    const agent = agentFor(harness);
    await agent.post('/api/e/testconf/auth').send({ password: 'viewer-pw' }).expect(200);
    await agent.post('/api/e/testconf/auth').send({ password: 'admin-pw' }).expect(200);
    expect((await agent.get('/api/me')).body.roles.testconf).toBe('admin');
    await agent.post('/api/e/testconf/auth').send({ password: 'viewer-pw' }).expect(200);
    expect((await agent.get('/api/me')).body.roles.testconf).toBe('viewer');
  });

  it('rate limits the 6th failed attempt with Retry-After', async () => {
    const agent = agentFor(harness);
    for (let i = 0; i < 5; i++) {
      await agent.post('/api/e/testconf/auth').send({ password: 'wrong' }).expect(403);
    }
    const res = await agent.post('/api/e/testconf/auth').send({ password: 'wrong' }).expect(429);
    expect(res.body.error.code).toBe('rate_limited');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('refunds the attempt budget when a password is correct', async () => {
    const agent = agentFor(harness);
    for (let i = 0; i < 4; i++) {
      await agent.post('/api/e/testconf/auth').send({ password: 'wrong' }).expect(403);
    }
    // A success returns its token, so the next wrong guess is still the 5th.
    await agent.post('/api/e/testconf/auth').send({ password: 'user-pw' }).expect(200);
    await agent.post('/api/e/testconf/auth').send({ password: 'wrong' }).expect(403);
  });

  it('viewing requires a role', async () => {
    const agent = agentFor(harness);
    const res = await agent.get('/api/e/testconf/bundle').expect(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('logout drops the role but keeps the name', async () => {
    const agent = agentFor(harness);
    await agent.post('/api/e/testconf/auth').send({ password: 'admin-pw' }).expect(200);
    await agent.patch('/api/me').send({ displayName: 'Robin' }).expect(200);
    await agent.post('/api/e/testconf/logout').expect(204);
    const me = await agent.get('/api/me').expect(200);
    expect(me.body.displayName).toBe('Robin');
    expect(me.body.roles).toEqual({});
    await agent.get('/api/e/testconf/bundle').expect(401);
  });

  it('404s for an unknown event', async () => {
    await agentFor(harness).post('/api/e/nope/auth').send({ password: 'x' }).expect(404);
  });
});
