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

describe('speaker profiles', () => {
  let harness: Harness;
  let eventId: number;
  let roomId: number;
  let admin: Agent;
  let user: Agent;
  let viewer: Agent;

  beforeEach(async () => {
    harness = makeHarness();
    eventId = seedEvent(harness.db);
    roomId = seedRoom(harness.db, eventId, { openTrack: 1 });
    admin = await actorWithRole(harness, 'testconf', 'admin-pw');
    user = await actorWithRole(harness, 'testconf', 'user-pw');
    viewer = await actorWithRole(harness, 'testconf', 'viewer-pw');
  });
  afterEach(() => harness.close());

  const makeSession = (agent: Agent, payload: Record<string, unknown> = {}) =>
    agent.post('/api/e/testconf/sessions').send({
      roomId,
      title: 'Talk',
      startsAt: at(DAY_ONE, 600),
      endsAt: at(DAY_ONE, 660),
      ...payload,
    });

  it('creates a person when a session names an unknown speaker', async () => {
    const res = await makeSession(admin, { speakerName: 'Ada Lovelace' }).expect(201);
    expect(res.body.speaker).toBe('Ada Lovelace');
    expect(res.body.speakerId).toBeGreaterThan(0);

    const bundle = await admin.get('/api/e/testconf/bundle').expect(200);
    expect(bundle.body.people.map((p: { name: string }) => p.name)).toEqual(['Ada Lovelace']);
  });

  it('reuses the existing person for the same name', async () => {
    const first = await makeSession(admin, { speakerName: 'Grace Hopper' }).expect(201);
    const second = await makeSession(admin, {
      speakerName: 'Grace Hopper',
      startsAt: at(DAY_ONE, 700),
      endsAt: at(DAY_ONE, 760),
    }).expect(201);
    expect(second.body.speakerId).toBe(first.body.speakerId);
  });

  it('clears the speaker on an empty name and rejects an unknown id', async () => {
    const created = await makeSession(admin, { speakerName: 'Temp' }).expect(201);
    const cleared = await admin
      .patch(`/api/e/testconf/sessions/${created.body.id}`)
      .send({ speakerName: '' })
      .expect(200);
    expect(cleared.body.speakerId).toBeNull();
    expect(cleared.body.speaker).toBe('');

    await admin
      .patch(`/api/e/testconf/sessions/${created.body.id}`)
      .send({ speakerId: 9999 })
      .expect(400);
  });

  it('will not take a person from another event', async () => {
    const otherEvent = seedEvent(harness.db, { slug: 'other' });
    seedRoom(harness.db, otherEvent, { openTrack: 1 });
    const otherAdmin = await actorWithRole(harness, 'other', 'admin-pw');
    const foreign = await otherAdmin
      .post('/api/e/other/people')
      .send({ name: 'Elsewhere' })
      .expect(201);
    await makeSession(admin, { speakerId: foreign.body.id }).expect(400);
  });

  it('serves a profile with the sessions that person hosts', async () => {
    const created = await makeSession(admin, { speakerName: 'Radia Perlman' }).expect(201);
    const detail = await viewer
      .get(`/api/e/testconf/people/${created.body.speakerId}`)
      .expect(200);
    expect(detail.body.person.name).toBe('Radia Perlman');
    expect(detail.body.sessions).toHaveLength(1);
    expect(detail.body.sessions[0].id).toBe(created.body.id);
  });

  it('lets organisers create, edit and delete profiles', async () => {
    const created = await admin
      .post('/api/e/testconf/people')
      .send({
        name: 'Barbara Liskov',
        bio: 'On **abstraction**.',
        links: [{ label: 'Site', url: 'https://example.org' }],
      })
      .expect(201);
    expect(created.body.links).toEqual([{ label: 'Site', url: 'https://example.org' }]);
    expect(created.body.claimed).toBe(false);

    const patched = await admin
      .patch(`/api/e/testconf/people/${created.body.id}`)
      .send({ bio: 'Updated' })
      .expect(200);
    expect(patched.body.bio).toBe('Updated');

    await admin.delete(`/api/e/testconf/people/${created.body.id}`).expect(204);
    await viewer.get(`/api/e/testconf/people/${created.body.id}`).expect(404);
  });

  it('detaches a deleted person from their sessions instead of losing them', async () => {
    const session = await makeSession(admin, { speakerName: 'Ephemeral' }).expect(201);
    await admin.delete(`/api/e/testconf/people/${session.body.speakerId}`).expect(204);

    const after = await admin.get(`/api/e/testconf/sessions/${session.body.id}`).expect(200);
    expect(after.body.session.speakerId).toBeNull();
    expect(after.body.session.speaker).toBe('');
  });

  it('rejects a non-http link and an overlong bio', async () => {
    await admin
      .post('/api/e/testconf/people')
      .send({ name: 'Bad', links: [{ label: 'x', url: 'javascript:alert(1)' }] })
      .expect(400);
    await admin
      .post('/api/e/testconf/people')
      .send({ name: 'Long', bio: 'x'.repeat(2001) })
      .expect(400);
  });

  it('keeps names unique within an event', async () => {
    await admin.post('/api/e/testconf/people').send({ name: 'Twin' }).expect(201);
    const clash = await admin.post('/api/e/testconf/people').send({ name: 'Twin' }).expect(409);
    expect(clash.body.error.code).toBe('name_taken');
  });

  it('blocks a non-admin from the roster endpoints', async () => {
    const person = await admin.post('/api/e/testconf/people').send({ name: 'Theirs' }).expect(201);
    await user.post('/api/e/testconf/people').send({ name: 'Nope' }).expect(403);
    await user.patch(`/api/e/testconf/people/${person.body.id}`).send({ bio: 'x' }).expect(403);
    await user.delete(`/api/e/testconf/people/${person.body.id}`).expect(403);
  });

  describe('your own profile', () => {
    it('creates one on first edit, defaulting to your display name', async () => {
      const me = await user.get('/api/me').expect(200);
      const created = await user
        .patch('/api/e/testconf/me/profile')
        .send({ bio: 'I like open tracks.' })
        .expect(201);
      expect(created.body.name).toBe(me.body.displayName);
      expect(created.body.isMine).toBe(true);
      expect(created.body.claimed).toBe(true);
    });

    it('updates the same profile rather than making a second one', async () => {
      const first = await user.patch('/api/e/testconf/me/profile').send({ bio: 'One' }).expect(201);
      const second = await user
        .patch('/api/e/testconf/me/profile')
        .send({ bio: 'Two', name: 'Renamed' })
        .expect(200);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.bio).toBe('Two');
      expect(second.body.name).toBe('Renamed');
    });

    it('lets a viewer edit their own profile too', async () => {
      const created = await viewer
        .patch('/api/e/testconf/me/profile')
        .send({ bio: 'Just watching.' })
        .expect(201);
      expect(created.body.isMine).toBe(true);
    });

    it('lets the owner patch it through the roster route, but not a stranger', async () => {
      const mine = await user.patch('/api/e/testconf/me/profile').send({ bio: 'Mine' }).expect(201);
      await user.patch(`/api/e/testconf/people/${mine.body.id}`).send({ bio: 'Edited' }).expect(200);
      await viewer.patch(`/api/e/testconf/people/${mine.body.id}`).send({ bio: 'No' }).expect(403);
      // Organisers still override.
      await admin.patch(`/api/e/testconf/people/${mine.body.id}`).send({ bio: 'Moderated' }).expect(200);
    });

    it('shows isMine only to the owner', async () => {
      await user.patch('/api/e/testconf/me/profile').send({ bio: 'Mine' }).expect(201);
      const asOwner = await user.get('/api/e/testconf/bundle').expect(200);
      const asOther = await viewer.get('/api/e/testconf/bundle').expect(200);
      expect(asOwner.body.people[0].isMine).toBe(true);
      expect(asOther.body.people[0].isMine).toBe(false);
      expect(asOther.body.people[0].claimed).toBe(true);
    });

    it('claims an unclaimed person that already has your name', async () => {
      // Naming yourself as the speaker auto-creates an unclaimed person. Editing
      // your profile afterwards must adopt that record, not collide with it —
      // otherwise you are locked out of your own profile permanently.
      const me = await user.get('/api/me').expect(200);
      const roomId = seedRoom(harness.db, eventId, { name: 'Self', openTrack: 1 });
      const session = await user
        .post('/api/e/testconf/sessions')
        .send({
          roomId,
          title: 'Mine',
          speakerName: me.body.displayName,
          startsAt: at(DAY_ONE, 800),
          endsAt: at(DAY_ONE, 860),
        })
        .expect(201);

      // 201: your profile now exists, whether it was created or adopted.
      const profile = await user
        .patch('/api/e/testconf/me/profile')
        .send({ bio: 'I ran this' })
        .expect(201);
      expect(profile.body.id).toBe(session.body.speakerId);
      expect(profile.body.isMine).toBe(true);
      expect(profile.body.bio).toBe('I ran this');

      // One person, not two.
      const bundle = await user.get('/api/e/testconf/bundle').expect(200);
      const named = bundle.body.people.filter(
        (p: { name: string }) => p.name === me.body.displayName,
      );
      expect(named).toHaveLength(1);
    });

    it('still refuses a name another identity has claimed', async () => {
      await viewer.patch('/api/e/testconf/me/profile').send({ name: 'Taken' }).expect(201);
      const res = await user
        .patch('/api/e/testconf/me/profile')
        .send({ name: 'Taken' })
        .expect(409);
      expect(res.body.error.code).toBe('name_taken');
    });

    it('claims an unclaimed roster entry when you take its name', async () => {
      await admin.post('/api/e/testconf/people').send({ name: 'Unclaimed' }).expect(201);
      const res = await user
        .patch('/api/e/testconf/me/profile')
        .send({ name: 'Unclaimed' })
        .expect(201);
      expect(res.body.isMine).toBe(true);
    });

    it('is read-only once the event is archived', async () => {
      await admin.patch('/api/e/testconf/settings').send({ archived: true }).expect(200);
      await user.patch('/api/e/testconf/me/profile').send({ bio: 'x' }).expect(409);
    });
  });
});
