import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DAY_ONE,
  actorWithRole,
  at,
  makeHarness,
  seedEvent,
  seedRoom,
  type Agent,
  type Harness,
} from './helpers.js';

describe('contributions', () => {
  let harness: Harness;
  let sessionId: number;
  let admin: Agent;
  let author: Agent;
  let otherUser: Agent;
  let viewer: Agent;

  beforeEach(async () => {
    harness = makeHarness();
    const eventId = seedEvent(harness.db);
    const roomId = seedRoom(harness.db, eventId, { openTrack: 1 });
    admin = await actorWithRole(harness, 'testconf', 'admin-pw');
    author = await actorWithRole(harness, 'testconf', 'user-pw');
    otherUser = await actorWithRole(harness, 'testconf', 'user-pw');
    viewer = await actorWithRole(harness, 'testconf', 'viewer-pw');

    const res = await admin
      .post('/api/e/testconf/sessions')
      .send({
        roomId,
        title: 'Talk',
        startsAt: at(DAY_ONE, 600),
        endsAt: at(DAY_ONE, 660),
      })
      .expect(201);
    sessionId = res.body.id;
  });
  afterEach(() => harness.close());

  const post = (agent: Agent, payload: Record<string, unknown>) =>
    agent.post(`/api/e/testconf/sessions/${sessionId}/contributions`).send(payload);

  it('accepts notes and questions from users', async () => {
    const note = await post(author, { kind: 'note', body: 'A note' }).expect(201);
    expect(note.body.kind).toBe('note');
    expect(note.body.createdByName).toMatch(/^attendee_/);
    await post(author, { kind: 'question', body: 'Why?' }).expect(201);
  });

  it('requires an http(s) URL for links and forbids one elsewhere', async () => {
    await post(author, { kind: 'link', body: 'Slides' }).expect(400);
    await post(author, {
      kind: 'link',
      body: 'Slides',
      url: 'javascript:alert(1)',
    }).expect(400);
    await post(author, { kind: 'note', body: 'A note', url: 'https://x.test' }).expect(400);
    const ok = await post(author, {
      kind: 'link',
      body: 'Slides',
      url: 'https://example.org/s',
    }).expect(201);
    expect(ok.body.url).toBe('https://example.org/s');
  });

  it('rejects an empty or overlong body', async () => {
    await post(author, { kind: 'note', body: '   ' }).expect(400);
    await post(author, { kind: 'note', body: 'x'.repeat(2001) }).expect(400);
  });

  it('blocks viewers', async () => {
    await post(viewer, { kind: 'note', body: 'Nope' }).expect(403);
  });

  it('lets the author delete their own but not another’s', async () => {
    const mine = await post(author, { kind: 'note', body: 'Mine' }).expect(201);
    await otherUser.delete(`/api/e/testconf/contributions/${mine.body.id}`).expect(403);
    await author.delete(`/api/e/testconf/contributions/${mine.body.id}`).expect(204);
  });

  it('lets an admin delete anyone’s', async () => {
    const theirs = await post(author, { kind: 'note', body: 'Theirs' }).expect(201);
    await admin.delete(`/api/e/testconf/contributions/${theirs.body.id}`).expect(204);
  });

  it('hides a contribution from non-admins but keeps it for admins', async () => {
    const item = await post(author, { kind: 'note', body: 'Spam' }).expect(201);
    await author.patch(`/api/e/testconf/contributions/${item.body.id}/hidden`).send({ hidden: true }).expect(403);
    await admin
      .patch(`/api/e/testconf/contributions/${item.body.id}/hidden`)
      .send({ hidden: true })
      .expect(200);

    const asUser = await author.get(`/api/e/testconf/sessions/${sessionId}`).expect(200);
    expect(asUser.body.contributions).toHaveLength(0);

    const asAdmin = await admin.get(`/api/e/testconf/sessions/${sessionId}`).expect(200);
    expect(asAdmin.body.contributions).toHaveLength(1);
    expect(asAdmin.body.contributions[0].hidden).toBe(true);
  });

  it('counts only visible contributions in the bundle', async () => {
    const a = await post(author, { kind: 'note', body: 'One' }).expect(201);
    await post(author, { kind: 'note', body: 'Two' }).expect(201);
    await admin.patch(`/api/e/testconf/contributions/${a.body.id}/hidden`).send({ hidden: true });

    const userBundle = await author.get('/api/e/testconf/bundle').expect(200);
    expect(userBundle.body.contributionCounts[sessionId]).toBe(1);

    const adminBundle = await admin.get('/api/e/testconf/bundle').expect(200);
    expect(adminBundle.body.contributionCounts[sessionId]).toBe(2);
  });

  it('404s a contribution belonging to another event', async () => {
    const otherEvent = seedEvent(harness.db, { slug: 'other' });
    const otherRoom = seedRoom(harness.db, otherEvent, { openTrack: 1 });
    const otherAdmin = await actorWithRole(harness, 'other', 'admin-pw');
    const otherSession = await otherAdmin
      .post('/api/e/other/sessions')
      .send({
        roomId: otherRoom,
        title: 'Elsewhere',
        startsAt: at(DAY_ONE, 600),
        endsAt: at(DAY_ONE, 660),
      })
      .expect(201);
    const foreign = await otherAdmin
      .post(`/api/e/other/sessions/${otherSession.body.id}/contributions`)
      .send({ kind: 'note', body: 'Elsewhere' })
      .expect(201);

    await admin.delete(`/api/e/testconf/contributions/${foreign.body.id}`).expect(404);
  });

  it('rate limits at 10 contributions a minute', async () => {
    for (let i = 0; i < 10; i++) {
      await post(author, { kind: 'note', body: `n${i}` }).expect(201);
    }
    const res = await post(author, { kind: 'note', body: 'over' }).expect(429);
    expect(res.body.error.code).toBe('rate_limited');
  });
});

describe('rooms and tags', () => {
  let harness: Harness;
  let eventId: number;
  let admin: Agent;
  let user: Agent;

  beforeEach(async () => {
    harness = makeHarness();
    eventId = seedEvent(harness.db);
    admin = await actorWithRole(harness, 'testconf', 'admin-pw');
    user = await actorWithRole(harness, 'testconf', 'user-pw');
  });
  afterEach(() => harness.close());

  it('is admin-only', async () => {
    await user.post('/api/e/testconf/rooms').send({ name: 'Nope' }).expect(403);
    await user.post('/api/e/testconf/tags').send({ name: 'Nope' }).expect(403);
    await user.patch('/api/e/testconf/settings').send({ name: 'Nope' }).expect(403);
  });

  it('creates, patches and soft-deletes a room', async () => {
    const created = await admin
      .post('/api/e/testconf/rooms')
      .send({ name: 'Hall', capacity: 100, openTrack: true })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'Hall', capacity: 100, openTrack: true });

    const patched = await admin
      .patch(`/api/e/testconf/rooms/${created.body.id}`)
      .send({ openTrack: false })
      .expect(200);
    expect(patched.body.openTrack).toBe(false);

    await admin.delete(`/api/e/testconf/rooms/${created.body.id}`).expect(204);
    const bundle = await admin.get('/api/e/testconf/bundle').expect(200);
    expect(bundle.body.rooms).toHaveLength(0);
  });

  it('refuses to delete a room that still has sessions', async () => {
    const roomId = seedRoom(harness.db, eventId, { openTrack: 1 });
    await admin
      .post('/api/e/testconf/sessions')
      .send({
        roomId,
        title: 'Occupied',
        startsAt: at(DAY_ONE, 600),
        endsAt: at(DAY_ONE, 660),
      })
      .expect(201);
    const res = await admin.delete(`/api/e/testconf/rooms/${roomId}`).expect(409);
    expect(res.body.error.code).toBe('room_in_use');
  });

  it('keeps tag names unique per event and revives a deleted one', async () => {
    const created = await admin.post('/api/e/testconf/tags').send({ name: 'AI' }).expect(201);
    await admin.post('/api/e/testconf/tags').send({ name: 'AI' }).expect(409);

    await admin.delete(`/api/e/testconf/tags/${created.body.id}`).expect(204);
    const revived = await admin
      .post('/api/e/testconf/tags')
      .send({ name: 'AI', color: '#123456' })
      .expect(201);
    expect(revived.body.id).toBe(created.body.id);
    expect(revived.body.color).toBe('#123456');
  });

  it('drops a deleted tag from its sessions', async () => {
    const roomId = seedRoom(harness.db, eventId, { openTrack: 1 });
    const tag = await admin.post('/api/e/testconf/tags').send({ name: 'Web' }).expect(201);
    const session = await admin
      .post('/api/e/testconf/sessions')
      .send({
        roomId,
        title: 'Tagged',
        startsAt: at(DAY_ONE, 600),
        endsAt: at(DAY_ONE, 660),
        tagIds: [tag.body.id],
      })
      .expect(201);
    expect(session.body.tagIds).toEqual([tag.body.id]);

    await admin.delete(`/api/e/testconf/tags/${tag.body.id}`).expect(204);
    const bundle = await admin.get('/api/e/testconf/bundle').expect(200);
    expect(bundle.body.sessions[0].tagIds).toEqual([]);
  });

  it('validates the colour format', async () => {
    await admin.post('/api/e/testconf/tags').send({ name: 'Bad', color: 'red' }).expect(400);
  });
});

describe('event settings and creation', () => {
  let harness: Harness;
  let admin: Agent;

  beforeEach(async () => {
    harness = makeHarness();
    seedEvent(harness.db);
    admin = await actorWithRole(harness, 'testconf', 'admin-pw');
  });
  afterEach(() => harness.close());

  it('needs the instance key to create an event', async () => {
    const payload = {
      name: 'New Conf',
      slug: 'new-conf',
      timezone: 'Europe/Berlin',
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      viewerPassword: 'viewer1',
      userPassword: 'user111',
      adminPassword: 'admin11',
    };
    await admin.post('/api/events').send(payload).expect(403);
    const res = await admin
      .post('/api/events')
      .set('X-Instance-Key', 'instance-pw')
      .send(payload)
      .expect(201);
    expect(res.body.slug).toBe('new-conf');

    // The creator is that event's admin straight away.
    const me = await admin.get('/api/me').expect(200);
    expect(me.body.roles['new-conf']).toBe('admin');
  });

  it('rejects a duplicate slug and a bad timezone', async () => {
    const base = {
      name: 'X',
      timezone: 'Europe/Berlin',
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      viewerPassword: 'viewer1',
      userPassword: 'user111',
      adminPassword: 'admin11',
    };
    await admin
      .post('/api/events')
      .set('X-Instance-Key', 'instance-pw')
      .send({ ...base, slug: 'testconf' })
      .expect(409);
    await admin
      .post('/api/events')
      .set('X-Instance-Key', 'instance-pw')
      .send({ ...base, slug: 'tz-conf', timezone: 'Mars/Olympus' })
      .expect(400);
  });

  it('clones rooms and tags but no sessions', async () => {
    await admin.post('/api/e/testconf/rooms').send({ name: 'Hall', openTrack: true }).expect(201);
    await admin.post('/api/e/testconf/tags').send({ name: 'AI' }).expect(201);
    const room = (await admin.get('/api/e/testconf/bundle')).body.rooms[0];
    await admin
      .post('/api/e/testconf/sessions')
      .send({
        roomId: room.id,
        title: 'Not copied',
        startsAt: at(DAY_ONE, 600),
        endsAt: at(DAY_ONE, 660),
      })
      .expect(201);

    await admin
      .post('/api/events/testconf/clone')
      .send({
        newSlug: 'testconf-2',
        newName: 'Test Conf 2',
        startDate: '2027-06-01',
        endDate: '2027-06-02',
        viewerPassword: 'viewer2',
        userPassword: 'user222',
        adminPassword: 'admin22',
      })
      .expect(201);

    const clone = await admin.get('/api/e/testconf-2/bundle').expect(200);
    expect(clone.body.rooms.map((r: { name: string }) => r.name)).toEqual(['Hall']);
    expect(clone.body.tags.map((t: { name: string }) => t.name)).toEqual(['AI']);
    expect(clone.body.sessions).toEqual([]);
    expect(clone.body.event.startDate).toBe('2027-06-01');
  });

  it('changes passwords through settings', async () => {
    await admin.patch('/api/e/testconf/settings').send({ adminPassword: 'brand-new' }).expect(200);
    const fresh = await actorWithRole(harness, 'testconf', 'brand-new');
    const bundle = await fresh.get('/api/e/testconf/bundle').expect(200);
    expect(bundle.body.role).toBe('admin');
  });

  it('defaults the user role label to attendee and lets an admin rename it', async () => {
    const before = await admin.get('/api/e/testconf/bundle').expect(200);
    expect(before.body.event.userRoleLabel).toBe('attendee');

    const updated = await admin
      .patch('/api/e/testconf/settings')
      .send({ userRoleLabel: '  participant  ' })
      .expect(200);
    expect(updated.body.userRoleLabel).toBe('participant');

    await admin.patch('/api/e/testconf/settings').send({ userRoleLabel: '   ' }).expect(400);
    await admin.patch('/api/e/testconf/settings').send({ userRoleLabel: 'x'.repeat(25) }).expect(400);
  });

  it('takes a user role label at creation and carries it into a clone', async () => {
    await admin
      .post('/api/events')
      .set('X-Instance-Key', 'instance-pw')
      .send({
        name: 'Labelled',
        slug: 'labelled',
        timezone: 'Europe/Berlin',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        viewerPassword: 'viewer1',
        userPassword: 'user111',
        adminPassword: 'admin11',
        userRoleLabel: 'member',
      })
      .expect(201);
    const bundle = await admin.get('/api/e/labelled/bundle').expect(200);
    expect(bundle.body.event.userRoleLabel).toBe('member');

    await admin
      .post('/api/events/labelled/clone')
      .send({
        newSlug: 'labelled-2',
        newName: 'Labelled 2',
        startDate: '2027-09-01',
        endDate: '2027-09-02',
        viewerPassword: 'viewer2',
        userPassword: 'user222',
        adminPassword: 'admin22',
      })
      .expect(201);
    const clone = await admin.get('/api/e/labelled-2/bundle').expect(200);
    expect(clone.body.event.userRoleLabel).toBe('member');
  });

  it('rejects an end date before the start', async () => {
    await admin
      .patch('/api/e/testconf/settings')
      .send({ startDate: '2026-06-05', endDate: '2026-06-01' })
      .expect(400);
  });
});
