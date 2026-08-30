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

describe('undo for soft deletes', () => {
  let harness: Harness;
  let roomId: number;
  let admin: Agent;
  let user: Agent;
  let sessionId: number;

  beforeEach(async () => {
    harness = makeHarness();
    const eventId = seedEvent(harness.db);
    roomId = seedRoom(harness.db, eventId, { name: 'Main Hall', openBooking: 1 });
    admin = await actorWithRole(harness, 'testconf', 'admin-pw');
    user = await actorWithRole(harness, 'testconf', 'user-pw');

    const created = await admin
      .post('/api/e/testconf/sessions')
      .send({
        roomId,
        title: 'Vandalised',
        startsAt: at(DAY_ONE, 600),
        endsAt: at(DAY_ONE, 660),
      })
      .expect(201);
    sessionId = created.body.id;
  });
  afterEach(() => harness.close());

  it('lists nothing when nothing is deleted', async () => {
    const res = await admin.get('/api/e/testconf/trash').expect(200);
    expect(res.body.sessions).toEqual([]);
    expect(res.body.contributions).toEqual([]);
  });

  it('lists a deleted session and restores it', async () => {
    await admin.delete(`/api/e/testconf/sessions/${sessionId}`).expect(204);

    const trash = await admin.get('/api/e/testconf/trash').expect(200);
    expect(trash.body.sessions).toHaveLength(1);
    expect(trash.body.sessions[0]).toMatchObject({ id: sessionId, title: 'Vandalised' });

    const restored = await admin.post(`/api/e/testconf/sessions/${sessionId}/restore`).expect(200);
    expect(restored.body.id).toBe(sessionId);
    expect(restored.body.title).toBe('Vandalised');

    const bundle = await admin.get('/api/e/testconf/bundle').expect(200);
    expect(bundle.body.sessions.map((s: { id: number }) => s.id)).toContain(sessionId);
    const after = await admin.get('/api/e/testconf/trash').expect(200);
    expect(after.body.sessions).toEqual([]);
  });

  it('restores a deleted contribution', async () => {
    const made = await user
      .post(`/api/e/testconf/sessions/${sessionId}/contributions`)
      .send({ kind: 'note', body: 'Worth keeping' })
      .expect(201);
    await admin.delete(`/api/e/testconf/contributions/${made.body.id}`).expect(204);

    const trash = await admin.get('/api/e/testconf/trash').expect(200);
    expect(trash.body.contributions).toHaveLength(1);

    await admin.post(`/api/e/testconf/contributions/${made.body.id}/restore`).expect(200);
    const detail = await admin.get(`/api/e/testconf/sessions/${sessionId}`).expect(200);
    expect(detail.body.contributions.map((c: { id: number }) => c.id)).toContain(made.body.id);
  });

  it('refuses to restore a session whose room is gone', async () => {
    await admin.delete(`/api/e/testconf/sessions/${sessionId}`).expect(204);
    await admin.delete(`/api/e/testconf/rooms/${roomId}`).expect(204);

    const res = await admin.post(`/api/e/testconf/sessions/${sessionId}/restore`).expect(409);
    expect(res.body.error.code).toBe('room_missing');
  });

  it('404s restoring something that was never deleted', async () => {
    await admin.post(`/api/e/testconf/sessions/${sessionId}/restore`).expect(404);
  });

  it('is admin-only', async () => {
    await admin.delete(`/api/e/testconf/sessions/${sessionId}`).expect(204);
    await user.get('/api/e/testconf/trash').expect(403);
    await user.post(`/api/e/testconf/sessions/${sessionId}/restore`).expect(403);
  });

  it('does not reach into another event', async () => {
    const otherEvent = seedEvent(harness.db, { slug: 'other' });
    seedRoom(harness.db, otherEvent);
    const otherAdmin = await actorWithRole(harness, 'other', 'admin-pw');
    await admin.delete(`/api/e/testconf/sessions/${sessionId}`).expect(204);

    await otherAdmin.post(`/api/e/other/sessions/${sessionId}/restore`).expect(404);
    const trash = await otherAdmin.get('/api/e/other/trash').expect(200);
    expect(trash.body.sessions).toEqual([]);
  });

  it('is blocked while the event is archived', async () => {
    await admin.delete(`/api/e/testconf/sessions/${sessionId}`).expect(204);
    await admin.patch('/api/e/testconf/settings').send({ archived: true }).expect(200);
    await admin.post(`/api/e/testconf/sessions/${sessionId}/restore`).expect(409);
  });
});
