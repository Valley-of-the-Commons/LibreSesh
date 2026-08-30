import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  actorWithRole,
  agentFor,
  makeHarness,
  seedEvent,
  type Agent,
  type Harness,
} from './helpers.js';

const BASE = {
  name: 'Password Conf',
  timezone: 'Europe/Berlin',
  startDate: '2026-09-01',
  endDate: '2026-09-02',
};

describe('event passwords must tell the roles apart', () => {
  let harness: Harness;
  let admin: Agent;

  beforeEach(async () => {
    harness = makeHarness();
    seedEvent(harness.db);
    admin = await actorWithRole(harness, 'testconf', 'admin-pw');
  });
  afterEach(() => harness.close());

  const create = (body: Record<string, unknown>) =>
    admin.post('/api/events').set('X-Instance-Key', 'instance-pw').send(body);

  it('rejects an event whose three passwords are all the same', async () => {
    const res = await create({
      ...BASE,
      slug: 'same-conf',
      viewerPassword: 'letmein',
      userPassword: 'letmein',
      adminPassword: 'letmein',
    }).expect(400);
    expect(res.body.error.message).toMatch(/must be different/i);
  });

  // The dangerous pair: roleForPassword checks admin first, so sharing this
  // one password would make every viewer an organiser.
  it('rejects a viewer password that equals the admin password', async () => {
    await create({
      ...BASE,
      slug: 'clash-conf',
      viewerPassword: 'shared-one',
      userPassword: 'user111',
      adminPassword: 'shared-one',
    }).expect(400);
    // Nothing was created.
    const events = await agentFor(harness).get('/api/events').expect(200);
    expect(events.body.map((e: { slug: string }) => e.slug)).not.toContain('clash-conf');
  });

  it('accepts three distinct passwords', async () => {
    await create({
      ...BASE,
      slug: 'fine-conf',
      viewerPassword: 'viewer1',
      userPassword: 'user111',
      adminPassword: 'admin11',
    }).expect(201);
  });

  it('rejects a clone whose passwords collide', async () => {
    await admin
      .post('/api/events/testconf/clone')
      .send({
        newSlug: 'clone-conf',
        newName: 'Clone Conf',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        viewerPassword: 'dup-pass',
        userPassword: 'dup-pass',
        adminPassword: 'admin11',
      })
      .expect(400);
  });

  describe('changing them later', () => {
    it('rejects a new attendee password that is already the admin password', async () => {
      const res = await admin
        .patch('/api/e/testconf/settings')
        .send({ userPassword: 'admin-pw' })
        .expect(400);
      expect(res.body.error.message).toMatch(/already the organiser password/i);
    });

    it('rejects two new passwords that match each other', async () => {
      await admin
        .patch('/api/e/testconf/settings')
        .send({ viewerPassword: 'twinned', userPassword: 'twinned' })
        .expect(400);
    });

    // Swapping two passwords in one request is fine: the collision each would
    // have had is resolved by the other half of the same update.
    it('allows a swap done in a single request', async () => {
      await admin
        .patch('/api/e/testconf/settings')
        .send({ viewerPassword: 'admin-pw', adminPassword: 'viewer-pw' })
        .expect(200);
      // The roles really did trade places.
      const someone = agentFor(harness);
      await someone.get('/api/me').expect(200);
      const res = await someone
        .post('/api/e/testconf/auth')
        .send({ password: 'admin-pw' })
        .expect(200);
      expect(res.body.role).toBe('viewer');
    });

    it('still allows changing one password to something new', async () => {
      await admin
        .patch('/api/e/testconf/settings')
        .send({ viewerPassword: 'brand-new-one' })
        .expect(200);
    });
  });
});
