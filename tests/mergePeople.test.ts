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

/** B2 of the identity spec: folding duplicate people into one. */
describe('merging people', () => {
  let harness: Harness;
  let eventId: number;
  let roomId: number;
  let admin: Agent;
  let user: Agent;

  beforeEach(async () => {
    harness = makeHarness();
    eventId = seedEvent(harness.db);
    roomId = seedRoom(harness.db, eventId, { openBooking: 1 });
    admin = await actorWithRole(harness, 'testconf', 'admin-pw');
    user = await actorWithRole(harness, 'testconf', 'user-pw');
  });
  afterEach(() => harness.close());

  const makeSession = (speakerName: string, startMin = 600) =>
    admin
      .post('/api/e/testconf/sessions')
      .send({
        roomId,
        title: `Talk by ${speakerName}`,
        speakerName,
        startsAt: at(DAY_ONE, startMin),
        endsAt: at(DAY_ONE, startMin + 30),
      })
      .expect(201);

  it('repoints sessions and pitches, then soft-deletes the duplicate', async () => {
    const a = await makeSession('Ada Lovelace');
    const b = await makeSession('A. Lovelace', 700);
    const survivorId = a.body.speakerId as number;
    const loserId = b.body.speakerId as number;
    await admin
      .post('/api/e/testconf/proposals')
      .send({ title: 'Pitch', speakerId: loserId })
      .expect(201);

    const res = await admin
      .post(`/api/e/testconf/people/${survivorId}/merge`)
      .send({ from: loserId })
      .expect(200);
    expect(res.body.id).toBe(survivorId);

    const bundle = await admin.get('/api/e/testconf/bundle').expect(200);
    expect(bundle.body.people.map((p: { id: number }) => p.id)).toEqual([survivorId]);
    for (const s of bundle.body.sessions) expect(s.speakerId).toBe(survivorId);
    const proposal = harness.db
      .prepare<[], { speaker_id: number }>('SELECT speaker_id FROM proposals')
      .get();
    expect(proposal?.speaker_id).toBe(survivorId);
  });

  it('moves the claim when only the duplicate is claimed', async () => {
    // The organiser typed "Ada" on a session; later Ada claims her own profile
    // under a variant name. The merge should hand her the surviving record.
    const a = await makeSession('Ada Lovelace');
    const survivorId = a.body.speakerId as number;
    const claimed = await user
      .patch('/api/e/testconf/me/profile')
      .send({ name: 'Ada L.', bio: 'hi' })
      .expect(201);

    await admin
      .post(`/api/e/testconf/people/${survivorId}/merge`)
      .send({ from: claimed.body.id })
      .expect(200);

    const bundle = await user.get('/api/e/testconf/bundle').expect(200);
    const survivor = bundle.body.people.find((p: { id: number }) => p.id === survivorId);
    expect(survivor.isMine).toBe(true);
    // Blank bio on the survivor filled from the duplicate.
    const detail = await user.get(`/api/e/testconf/people/${survivorId}`).expect(200);
    expect(detail.body.person.bio).toBe('hi');
  });

  it('keeps the survivor’s claim when both sides are claimed', async () => {
    const mine = await user.patch('/api/e/testconf/me/profile').send({ name: 'Ada' }).expect(201);
    const viewer = await actorWithRole(harness, 'testconf', 'viewer-pw');
    const theirs = await viewer
      .patch('/api/e/testconf/me/profile')
      .send({ name: 'Ada 2' })
      .expect(201);

    await admin
      .post(`/api/e/testconf/people/${mine.body.id}/merge`)
      .send({ from: theirs.body.id })
      .expect(200);

    const bundle = await user.get('/api/e/testconf/bundle').expect(200);
    const survivor = bundle.body.people.find((p: { id: number }) => p.id === mine.body.id);
    expect(survivor.isMine).toBe(true);
  });

  it('refuses self-merge, unknown profiles, and non-admins', async () => {
    const a = await makeSession('Solo');
    const id = a.body.speakerId as number;
    await admin.post(`/api/e/testconf/people/${id}/merge`).send({ from: id }).expect(400);
    await admin.post(`/api/e/testconf/people/${id}/merge`).send({ from: 9999 }).expect(404);
    await user.post(`/api/e/testconf/people/${id}/merge`).send({ from: id }).expect(403);
  });
});
