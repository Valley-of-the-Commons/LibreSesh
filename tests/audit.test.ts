import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuditPageDto } from '../server/src/shared/types.js';
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

describe('the audit log, read back', () => {
  let harness: Harness;
  let admin: Agent;
  let eventId: number;
  let roomId: number;

  beforeEach(async () => {
    harness = makeHarness();
    eventId = seedEvent(harness.db);
    roomId = seedRoom(harness.db, eventId, { name: 'Main hall' });
    admin = await actorWithRole(harness, 'testconf', 'admin-pw');
  });
  afterEach(() => harness.close());

  const read = async (query = ''): Promise<AuditPageDto> =>
    (await admin.get(`/api/e/testconf/audit${query}`).expect(200)).body as AuditPageDto;

  const makeSession = (title: string, startMin = 600) =>
    admin
      .post('/api/e/testconf/sessions')
      .send({
        roomId,
        title,
        startsAt: at(DAY_ONE, startMin),
        endsAt: at(DAY_ONE, startMin + 30),
      })
      .expect(201);

  it('is admin-only', async () => {
    const viewer = await actorWithRole(harness, 'testconf', 'viewer-pw');
    await viewer.get('/api/e/testconf/audit').expect(403);
    const user = await actorWithRole(harness, 'testconf', 'user-pw');
    await user.get('/api/e/testconf/audit').expect(403);
    await admin.get('/api/e/testconf/audit').expect(200);
  });

  it('records who did what, newest first', async () => {
    const created = await makeSession('Opening keynote');
    const sessionId = (created.body as { id: number }).id;
    await admin.delete(`/api/e/testconf/sessions/${sessionId}`).expect(204);

    const page = await read();
    expect(page.entries[0]).toMatchObject({
      action: 'delete',
      entity: 'session',
      entityId: sessionId,
    });
    expect(page.entries[1]).toMatchObject({ action: 'create', entity: 'session' });
    expect(page.entries[0]?.actorName).toBeTruthy();
  });

  /** A row in a table is not a recovery tool; a name is. */
  it('names the thing that was touched, even after it was deleted', async () => {
    const created = await makeSession('Opening keynote');
    await admin
      .delete(`/api/e/testconf/sessions/${(created.body as { id: number }).id}`)
      .expect(204);

    const page = await read();
    expect(page.entries[0]?.entityLabel).toBe('Opening keynote');
  });

  it('covers contributions, rooms, tags and people, not just sessions', async () => {
    const created = await makeSession('Talk');
    const sessionId = (created.body as { id: number }).id;
    const note = await admin
      .post(`/api/e/testconf/sessions/${sessionId}/contributions`)
      .send({ kind: 'note', body: 'Something said in the room' })
      .expect(201);
    await admin
      .delete(`/api/e/testconf/contributions/${(note.body as { id: number }).id}`)
      .expect(204);
    await admin.post('/api/e/testconf/rooms').send({ name: 'Side room' }).expect(201);
    await admin.post('/api/e/testconf/tags').send({ name: 'Workshop' }).expect(201);
    await admin.post('/api/e/testconf/people').send({ name: 'Ada' }).expect(201);

    const page = await read();
    const seen = page.entries.map((e) => `${e.action} ${e.entity}`);
    expect(seen).toContain('delete contribution');
    expect(seen).toContain('create room');
    expect(seen).toContain('create tag');
    expect(seen).toContain('create person');
    // The deleted note is still named, which is the point of a moderation log.
    const deletion = page.entries.find((e) => e.entity === 'contribution');
    expect(deletion?.entityLabel).toBe('Something said in the room');
  });

  it('shows one event and not its neighbour', async () => {
    seedEvent(harness.db, { slug: 'otherconf' });
    const other = await actorWithRole(harness, 'otherconf', 'admin-pw');
    await other.post('/api/e/otherconf/rooms').send({ name: 'Elsewhere' }).expect(201);
    await makeSession('Ours');

    const page = await read();
    expect(page.entries.every((e) => e.entityLabel !== 'Elsewhere')).toBe(true);
  });

  it('pages backwards through a long log without repeating a row', async () => {
    // Straight into the table: this is about paging a long log, and going
    // through the API would only exercise the write rate limiter.
    const insert = harness.db.prepare(
      'INSERT INTO audit (identity_id, event_id, action, entity, entity_id, at) VALUES (NULL, ?, ?, ?, ?, ?)',
    );
    for (let i = 0; i < 55; i += 1) {
      insert.run(eventId, 'create', 'tag', i + 1, new Date(Date.now() + i).toISOString());
    }

    const first = await read();
    expect(first.entries).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();

    const second = await read(`?before=${first.nextCursor}`);
    expect(second.entries.length).toBeGreaterThan(0);

    const ids = new Set([...first.entries, ...second.entries].map((e) => e.id));
    expect(ids.size).toBe(first.entries.length + second.entries.length);
    // Strictly descending, so "newest first" holds across the page boundary.
    const all = [...first.entries, ...second.entries].map((e) => e.id);
    expect(all).toEqual([...all].sort((a, b) => b - a));
    expect(second.nextCursor).toBeNull();
  });
});
