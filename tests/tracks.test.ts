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

describe('tracks', () => {
  let harness: Harness;
  let admin: Agent;
  let eventId: number;
  let roomId: number;

  beforeEach(async () => {
    harness = makeHarness();
    eventId = seedEvent(harness.db);
    roomId = seedRoom(harness.db, eventId);
    admin = await actorWithRole(harness, 'testconf', 'admin-pw');
  });
  afterEach(() => harness.close());

  const newSession = (body: Record<string, unknown> = {}) =>
    admin
      .post('/api/e/testconf/sessions')
      .send({
        roomId,
        title: 'Talk',
        startsAt: at(DAY_ONE, 600),
        endsAt: at(DAY_ONE, 660),
        ...body,
      });

  it('starts with none, so the schedule never offers to group by them', async () => {
    const res = await admin.get('/api/e/testconf/bundle').expect(200);
    expect(res.body.tracks).toEqual([]);
  });

  it('creates a track with a colour nothing else is using', async () => {
    const a = await admin.post('/api/e/testconf/tracks').send({ name: 'Design' }).expect(201);
    const b = await admin.post('/api/e/testconf/tracks').send({ name: 'Ops' }).expect(201);
    expect(a.body.color).not.toBe(b.body.color);
    expect(a.body.sortOrder).toBe(0);
    expect(b.body.sortOrder).toBe(1);
  });

  it('keeps names unique per event and revives a deleted one', async () => {
    const made = await admin.post('/api/e/testconf/tracks').send({ name: 'Design' }).expect(201);
    await admin.post('/api/e/testconf/tracks').send({ name: 'Design' }).expect(409);

    await admin.delete(`/api/e/testconf/tracks/${made.body.id}`).expect(204);
    const revived = await admin
      .post('/api/e/testconf/tracks')
      .send({ name: 'Design', color: '#123456' })
      .expect(201);
    expect(revived.body.id).toBe(made.body.id);
    expect(revived.body.color).toBe('#123456');
  });

  it('renames and recolours', async () => {
    const made = await admin.post('/api/e/testconf/tracks').send({ name: 'Design' }).expect(201);
    const patched = await admin
      .patch(`/api/e/testconf/tracks/${made.body.id}`)
      .send({ name: 'Craft', color: '#abcdef' })
      .expect(200);
    expect(patched.body).toMatchObject({ name: 'Craft', color: '#abcdef' });
  });

  it('refuses to rename onto another track’s name', async () => {
    await admin.post('/api/e/testconf/tracks').send({ name: 'Design' }).expect(201);
    const ops = await admin.post('/api/e/testconf/tracks').send({ name: 'Ops' }).expect(201);
    const res = await admin
      .patch(`/api/e/testconf/tracks/${ops.body.id}`)
      .send({ name: 'Design' })
      .expect(409);
    expect(res.body.error.code).toBe('track_exists');
  });

  it('reorders wholesale, since that order is the column order', async () => {
    const a = await admin.post('/api/e/testconf/tracks').send({ name: 'A' }).expect(201);
    const b = await admin.post('/api/e/testconf/tracks').send({ name: 'B' }).expect(201);
    const c = await admin.post('/api/e/testconf/tracks').send({ name: 'C' }).expect(201);

    const res = await admin
      .patch('/api/e/testconf/tracks')
      .send({ ids: [c.body.id, a.body.id, b.body.id] })
      .expect(200);
    expect(res.body.map((t: { name: string }) => t.name)).toEqual(['C', 'A', 'B']);
  });

  it('refuses a reorder that does not name every track exactly once', async () => {
    const a = await admin.post('/api/e/testconf/tracks').send({ name: 'A' }).expect(201);
    await admin.post('/api/e/testconf/tracks').send({ name: 'B' }).expect(201);
    await admin.patch('/api/e/testconf/tracks').send({ ids: [a.body.id] }).expect(400);
    await admin
      .patch('/api/e/testconf/tracks')
      .send({ ids: [a.body.id, a.body.id] })
      .expect(400);
  });

  it('blocks non-admins', async () => {
    const user = await actorWithRole(harness, 'testconf', 'user-pw');
    await user.post('/api/e/testconf/tracks').send({ name: 'Sneaky' }).expect(403);
  });

  describe('on a session', () => {
    it('assigns a track at creation and reports it', async () => {
      const track = await admin.post('/api/e/testconf/tracks').send({ name: 'Design' }).expect(201);
      const res = await newSession({ trackId: track.body.id }).expect(201);
      expect(res.body.trackId).toBe(track.body.id);
    });

    it('defaults to no track', async () => {
      const res = await newSession().expect(201);
      expect(res.body.trackId).toBeNull();
    });

    it('rejects a track from another event', async () => {
      const otherId = seedEvent(harness.db, { slug: 'other' });
      const other = await actorWithRole(harness, 'other', 'admin-pw');
      seedRoom(harness.db, otherId);
      const foreign = await other.post('/api/e/other/tracks').send({ name: 'Design' }).expect(201);
      await newSession({ trackId: foreign.body.id }).expect(400);
    });

    it('leaves the track alone when a patch omits it', async () => {
      const track = await admin.post('/api/e/testconf/tracks').send({ name: 'Design' }).expect(201);
      const session = await newSession({ trackId: track.body.id }).expect(201);
      const patched = await admin
        .patch(`/api/e/testconf/sessions/${session.body.id}`)
        .send({ title: 'Renamed' })
        .expect(200);
      expect(patched.body.trackId).toBe(track.body.id);
    });

    it('clears the track on an explicit null', async () => {
      const track = await admin.post('/api/e/testconf/tracks').send({ name: 'Design' }).expect(201);
      const session = await newSession({ trackId: track.body.id }).expect(201);
      const patched = await admin
        .patch(`/api/e/testconf/sessions/${session.body.id}`)
        .send({ trackId: null })
        .expect(200);
      expect(patched.body.trackId).toBeNull();
    });

    it('deleting a track clears it from its sessions rather than refusing', async () => {
      const track = await admin.post('/api/e/testconf/tracks').send({ name: 'Design' }).expect(201);
      const session = await newSession({ trackId: track.body.id }).expect(201);
      await admin.delete(`/api/e/testconf/tracks/${track.body.id}`).expect(204);

      const res = await admin.get('/api/e/testconf/bundle').expect(200);
      expect(res.body.tracks).toEqual([]);
      const kept = res.body.sessions.find((s: { id: number }) => s.id === session.body.id);
      expect(kept.trackId).toBeNull();
    });
  });
});
