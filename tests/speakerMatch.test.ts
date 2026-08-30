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

/** B1 of the identity spec: forgiving speaker matching, so name variants stop
 *  spawning duplicate people. */
describe('speaker matching', () => {
  let harness: Harness;
  let eventId: number;
  let roomId: number;
  let admin: Agent;

  beforeEach(async () => {
    harness = makeHarness();
    eventId = seedEvent(harness.db);
    roomId = seedRoom(harness.db, eventId, { openBooking: 1 });
    admin = await actorWithRole(harness, 'testconf', 'admin-pw');
  });
  afterEach(() => harness.close());

  const makeSession = (payload: Record<string, unknown> = {}, startMin = 600) =>
    admin.post('/api/e/testconf/sessions').send({
      roomId,
      title: 'Talk',
      startsAt: at(DAY_ONE, startMin),
      endsAt: at(DAY_ONE, startMin + 30),
      ...payload,
    });

  it('matches an existing person regardless of case and stray whitespace', async () => {
    const first = await makeSession({ speakerName: 'Ada Lovelace' }).expect(201);
    const second = await makeSession({ speakerName: '  ada   LOVELACE ' }, 700).expect(201);
    expect(second.body.speakerId).toBe(first.body.speakerId);

    const bundle = await admin.get('/api/e/testconf/bundle').expect(200);
    expect(bundle.body.people).toHaveLength(1);
  });

  it('stores a new speaker with collapsed whitespace', async () => {
    const res = await makeSession({ speakerName: ' Grace   Hopper ' }).expect(201);
    const bundle = await admin.get('/api/e/testconf/bundle').expect(200);
    const person = bundle.body.people.find(
      (p: { id: number }) => p.id === res.body.speakerId,
    );
    expect(person.name).toBe('Grace Hopper');
  });

  it('prefers a claimed profile over an unclaimed twin', async () => {
    // Unclaimed first (lower id), then a claimed profile under the same name.
    const now = new Date().toISOString();
    harness.db
      .prepare(
        `INSERT INTO people (event_id, identity_id, name, bio, links, created_at, updated_at)
         VALUES (?, NULL, 'Sam', '', '[]', ?, ?)`,
      )
      .run(eventId, now, now);
    const identityId = harness.db
      .prepare<[], { id: number }>('SELECT id FROM identities ORDER BY id LIMIT 1')
      .get()!.id;
    const claimed = Number(
      harness.db
        .prepare(
          `INSERT INTO people (event_id, identity_id, name, bio, links, created_at, updated_at)
           VALUES (?, ?, 'sam', '', '[]', ?, ?)`,
        )
        .run(eventId, identityId, now, now).lastInsertRowid,
    );

    const res = await makeSession({ speakerName: 'SAM' }).expect(201);
    expect(res.body.speakerId).toBe(claimed);
  });

  it('rejects a speaker id from another event, on proposals too', async () => {
    seedEvent(harness.db, { slug: 'otherconf' });
    const foreign = Number(
      harness.db
        .prepare(
          `INSERT INTO people (event_id, identity_id, name, bio, links, created_at, updated_at)
           VALUES ((SELECT id FROM events WHERE slug = 'otherconf'), NULL, 'Intruder', '', '[]', '', '')`,
        )
        .run().lastInsertRowid,
    );
    await makeSession({ speakerId: foreign }).expect(400);
    await admin
      .post('/api/e/testconf/proposals')
      .send({ title: 'Pitch', speakerId: foreign })
      .expect(400);
  });
});
