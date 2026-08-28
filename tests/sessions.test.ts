import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DAY_ONE,
  DAY_TWO,
  actorWithRole,
  agentFor,
  at,
  makeHarness,
  seedEvent,
  seedRoom,
  seedTag,
  type Agent,
  type Harness,
} from './helpers.js';

describe('session write rules', () => {
  let harness: Harness;
  let fixedRoom: number;
  let openRoom: number;
  let tagId: number;
  let admin: Agent;
  let user: Agent;
  let viewer: Agent;

  beforeEach(async () => {
    harness = makeHarness();
    const eventId = seedEvent(harness.db);
    fixedRoom = seedRoom(harness.db, eventId, { name: 'Main Hall' });
    openRoom = seedRoom(harness.db, eventId, { name: 'Open Track', openTrack: 1, sortOrder: 1 });
    tagId = seedTag(harness.db, eventId);
    admin = await actorWithRole(harness, 'testconf', 'admin-pw');
    user = await actorWithRole(harness, 'testconf', 'user-pw');
    viewer = await actorWithRole(harness, 'testconf', 'viewer-pw');
  });
  afterEach(() => harness.close());

  const body = (overrides: Record<string, unknown> = {}) => ({
    roomId: openRoom,
    title: 'A session',
    startsAt: at(DAY_ONE, 600),
    endsAt: at(DAY_ONE, 660),
    ...overrides,
  });

  const create = (agent: Agent, overrides: Record<string, unknown> = {}) =>
    agent.post('/api/e/testconf/sessions').send(body(overrides));

  it('lets an admin create an official session in any room', async () => {
    const res = await create(admin, { roomId: fixedRoom, type: 'official' }).expect(201);
    expect(res.body.type).toBe('official');
    expect(res.body.createdByName).toMatch(/^anon_/);
  });

  it('forces a user session to type open', async () => {
    const res = await create(user, { type: 'official' }).expect(201);
    expect(res.body.type).toBe('open');
  });

  it('stops a user scheduling outside an open track', async () => {
    const res = await create(user, { roomId: fixedRoom }).expect(403);
    expect(res.body.error.message).toMatch(/open track/i);
  });

  it('stops a viewer creating anything', async () => {
    await create(viewer).expect(403);
  });

  it('stops an anonymous visitor creating anything', async () => {
    await agentFor(harness).post('/api/e/testconf/sessions').send(body()).expect(401);
  });

  it('rejects times off the 5-minute grid', async () => {
    await create(admin, { startsAt: at(DAY_ONE, 600).replace(':00:00', ':03:00') }).expect(400);
  });

  it('rejects a duration below 5 or above 480 minutes', async () => {
    await create(admin, { endsAt: at(DAY_ONE, 600) }).expect(400);
    await create(admin, { endsAt: at(DAY_ONE, 600 + 485) }).expect(400);
  });

  it('keeps a user inside the event dates and day viewport', async () => {
    await create(user, {
      startsAt: at('2026-05-30', 600),
      endsAt: at('2026-05-30', 660),
    }).expect(400);
    await create(user, { startsAt: at(DAY_ONE, 400), endsAt: at(DAY_ONE, 460) }).expect(400);
  });

  it('lets an admin place a session outside the day viewport', async () => {
    await create(admin, {
      roomId: fixedRoom,
      startsAt: at(DAY_ONE, 60),
      endsAt: at(DAY_ONE, 120),
    }).expect(201);
  });

  it('409s a user overlap but allows an admin one', async () => {
    await create(user).expect(201);
    const clash = await create(user, {
      startsAt: at(DAY_ONE, 630),
      endsAt: at(DAY_ONE, 690),
    }).expect(409);
    expect(clash.body.error.code).toBe('overlap');

    await create(admin, {
      startsAt: at(DAY_ONE, 630),
      endsAt: at(DAY_ONE, 690),
    }).expect(201);
  });

  it('treats back-to-back sessions as non-overlapping', async () => {
    await create(user).expect(201);
    await create(user, { startsAt: at(DAY_ONE, 660), endsAt: at(DAY_ONE, 720) }).expect(201);
  });

  it('rejects a tag from another event', async () => {
    const otherEvent = seedEvent(harness.db, { slug: 'other' });
    const otherTag = seedTag(harness.db, otherEvent, 'Foreign');
    await create(admin, { tagIds: [otherTag] }).expect(400);
    await create(admin, { tagIds: [tagId] }).expect(201);
  });

  it('404s a room from another event', async () => {
    const otherEvent = seedEvent(harness.db, { slug: 'other' });
    const foreignRoom = seedRoom(harness.db, otherEvent);
    await create(admin, { roomId: foreignRoom }).expect(404);
  });
});

describe('editing and deleting sessions', () => {
  let harness: Harness;
  let openRoom: number;
  let admin: Agent;
  let owner: Agent;
  let otherUser: Agent;

  beforeEach(async () => {
    harness = makeHarness();
    const eventId = seedEvent(harness.db);
    seedRoom(harness.db, eventId, { name: 'Main Hall' });
    openRoom = seedRoom(harness.db, eventId, { name: 'Open Track', openTrack: 1, sortOrder: 1 });
    admin = await actorWithRole(harness, 'testconf', 'admin-pw');
    owner = await actorWithRole(harness, 'testconf', 'user-pw');
    otherUser = await actorWithRole(harness, 'testconf', 'user-pw');
  });
  afterEach(() => harness.close());

  const makeOpenSession = async (agent: Agent) => {
    const res = await agent
      .post('/api/e/testconf/sessions')
      .send({
        roomId: openRoom,
        title: 'Mine',
        startsAt: at(DAY_ONE, 600),
        endsAt: at(DAY_ONE, 660),
      })
      .expect(201);
    return res.body as { id: number; updatedAt: string };
  };

  it('lets the owner edit their open session', async () => {
    const session = await makeOpenSession(owner);
    const res = await owner
      .patch(`/api/e/testconf/sessions/${session.id}`)
      .send({ title: 'Renamed' })
      .expect(200);
    expect(res.body.title).toBe('Renamed');
    expect(res.body.updatedAt).not.toBe(session.updatedAt);
  });

  it("stops a user editing someone else's session", async () => {
    const session = await makeOpenSession(owner);
    await otherUser
      .patch(`/api/e/testconf/sessions/${session.id}`)
      .send({ title: 'Hijacked' })
      .expect(403);
  });

  it('stops a user editing an official session', async () => {
    const created = await admin
      .post('/api/e/testconf/sessions')
      .send({
        roomId: openRoom,
        type: 'official',
        title: 'Official',
        startsAt: at(DAY_ONE, 700),
        endsAt: at(DAY_ONE, 760),
      })
      .expect(201);
    await owner
      .patch(`/api/e/testconf/sessions/${created.body.id}`)
      .send({ title: 'No' })
      .expect(403);
  });

  it('lets an admin edit anything', async () => {
    const session = await makeOpenSession(owner);
    await admin
      .patch(`/api/e/testconf/sessions/${session.id}`)
      .send({ title: 'Moderated' })
      .expect(200);
  });

  it('409s a stale edit and passes a matching expectedUpdatedAt', async () => {
    const session = await makeOpenSession(owner);
    await owner
      .patch(`/api/e/testconf/sessions/${session.id}`)
      .send({ title: 'First', expectedUpdatedAt: session.updatedAt })
      .expect(200);
    const stale = await owner
      .patch(`/api/e/testconf/sessions/${session.id}`)
      .send({ title: 'Second', expectedUpdatedAt: session.updatedAt })
      .expect(409);
    expect(stale.body.error.code).toBe('stale');
  });

  it('soft-deletes and then hides the session', async () => {
    const session = await makeOpenSession(owner);
    await owner.delete(`/api/e/testconf/sessions/${session.id}`).expect(204);
    await owner.get(`/api/e/testconf/sessions/${session.id}`).expect(404);
    const row = harness.db
      .prepare<[number], { deleted_at: string | null }>(
        'SELECT deleted_at FROM sessions WHERE id = ?',
      )
      .get(session.id);
    expect(row?.deleted_at).not.toBeNull();
  });

  it('lets a user move their session between open-track rooms only', async () => {
    const session = await makeOpenSession(owner);
    const fixed = harness.db
      .prepare<[], { id: number }>("SELECT id FROM rooms WHERE name = 'Main Hall'")
      .get() as { id: number };
    await owner
      .patch(`/api/e/testconf/sessions/${session.id}`)
      .send({ roomId: fixed.id })
      .expect(403);
  });

  it('spans a second day when the event allows it', async () => {
    const res = await admin
      .post('/api/e/testconf/sessions')
      .send({
        roomId: openRoom,
        title: 'Day two',
        startsAt: at(DAY_TWO, 600),
        endsAt: at(DAY_TWO, 660),
      })
      .expect(201);
    expect(res.body.startsAt).toBe(at(DAY_TWO, 600));
  });
});

describe('archived events', () => {
  let harness: Harness;
  let admin: Agent;
  let roomId: number;

  beforeEach(async () => {
    harness = makeHarness();
    const eventId = seedEvent(harness.db, { archived: 1 });
    roomId = seedRoom(harness.db, eventId, { openTrack: 1 });
    admin = await actorWithRole(harness, 'testconf', 'admin-pw');
  });
  afterEach(() => harness.close());

  it('stays readable but refuses writes', async () => {
    await admin.get('/api/e/testconf/bundle').expect(200);
    const res = await admin
      .post('/api/e/testconf/sessions')
      .send({
        roomId,
        title: 'Nope',
        startsAt: at(DAY_ONE, 600),
        endsAt: at(DAY_ONE, 660),
      })
      .expect(409);
    expect(res.body.error.code).toBe('archived');
  });

  it('still lets an admin un-archive', async () => {
    await admin.patch('/api/e/testconf/settings').send({ archived: false }).expect(200);
    await admin
      .post('/api/e/testconf/sessions')
      .send({
        roomId,
        title: 'Now allowed',
        startsAt: at(DAY_ONE, 600),
        endsAt: at(DAY_ONE, 660),
      })
      .expect(201);
  });
});
