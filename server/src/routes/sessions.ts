import { Router } from 'express';
import { requireWritable } from '../auth.js';
import { audit } from '../audit.js';
import type { Ctx } from '../context.js';
import type { SessionRow } from '../db.js';
import { loadSessionDto } from '../mappers.js';
import { getPermissions, requireCapability } from '../permissions.js';
import { limit } from '../ratelimit.js';
import {
  assertMayMutate,
  assertMayPlace,
  assertNoOverlap,
  assertNotStale,
  assertTagsBelong,
  assertTrackBelongs,
  assertValidTimes,
  assertWithinEventWindow,
  getRoom,
  getSession,
} from '../sessionRules.js';
import { resolveSpeaker } from '../speakers.js';
import { parse, sessionPatchSchema, sessionSchema } from '../validation.js';

function setTags(ctx: Ctx, sessionId: number, tagIds: number[]): void {
  ctx.db.prepare('DELETE FROM session_tags WHERE session_id = ?').run(sessionId);
  const insert = ctx.db.prepare(
    'INSERT OR IGNORE INTO session_tags (session_id, tag_id) VALUES (?, ?)',
  );
  for (const tagId of new Set(tagIds)) insert.run(sessionId, tagId);
}

export function sessionRoutes(ctx: Ctx): Router {
  const router = Router({ mergeParams: true });
  const userWrite = [
    requireCapability(ctx.db, 'session.create_open'),
    requireWritable,
    limit(ctx.limiter, 'session'),
  ];

  router.post('/sessions', ...userWrite, (req, res) => {
    const body = parse(sessionSchema, req.body);
    const room = getRoom(ctx.db, req.event.id, body.roomId);
    // Only admins choose the type; anyone else is placing an open session.
    const type = req.role === 'admin' ? (body.type ?? 'official') : 'open';
    assertMayPlace(getPermissions(ctx.db, req.event.id), req.role, room, type);

    const window = { startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt) };
    assertValidTimes(req.event, window);
    if (req.role !== 'admin') {
      assertWithinEventWindow(req.event, window);
      assertNoOverlap(ctx.db, req.event.id, room.id, window);
    }
    const tagIds = body.tagIds ?? [];
    assertTagsBelong(ctx.db, req.event.id, tagIds);
    const trackId = body.trackId ?? null;
    assertTrackBelongs(ctx.db, req.event.id, trackId);

    const now = new Date().toISOString();
    const id = ctx.db.transaction((): number => {
      const speakerId = resolveSpeaker(ctx.db, req.event.id, body, null);
      const info = ctx.db
        .prepare(
          `INSERT INTO sessions
            (event_id, room_id, track_id, type, title, description, speaker, speaker_id,
             livestream_url, starts_at, ends_at, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          req.event.id,
          room.id,
          trackId,
          type,
          body.title,
          body.description ?? '',
          speakerId,
          body.livestreamUrl ?? '',
          window.startsAt.toISOString(),
          window.endsAt.toISOString(),
          req.identity.id,
          now,
          now,
        );
      const newId = Number(info.lastInsertRowid);
      setTags(ctx, newId, tagIds);
      return newId;
    })();

    const dto = loadSessionDto(ctx.db, getSession(ctx.db, req.event.id, id));
    audit(ctx.db, {
      identityId: req.identity.id,
      eventId: req.event.id,
      action: 'create',
      entity: 'session',
      entityId: id,
    });
    ctx.broker.publish(req.event.slug, 'session.created', dto);
    res.status(201).json(dto);
  });

  router.patch('/sessions/:id', ...userWrite, (req, res) => {
    const existing = getSession(ctx.db, req.event.id, Number(req.params.id));
    assertMayMutate(getPermissions(ctx.db, req.event.id), req.role, req.identity.id, existing);

    const body = parse(sessionPatchSchema, req.body);
    assertNotStale(existing, body.expectedUpdatedAt);

    const room = getRoom(ctx.db, req.event.id, body.roomId ?? existing.room_id);
    const type = req.role === 'admin' ? (body.type ?? existing.type) : existing.type;
    if (body.roomId !== undefined || body.type !== undefined) {
      assertMayPlace(getPermissions(ctx.db, req.event.id), req.role, room, type);
    }

    const window = {
      startsAt: new Date(body.startsAt ?? existing.starts_at),
      endsAt: new Date(body.endsAt ?? existing.ends_at),
    };
    assertValidTimes(req.event, window);
    if (req.role !== 'admin') {
      assertWithinEventWindow(req.event, window);
      assertNoOverlap(ctx.db, req.event.id, room.id, window, existing.id);
    }
    if (body.tagIds) assertTagsBelong(ctx.db, req.event.id, body.tagIds);
    // `undefined` leaves the track alone; an explicit `null` clears it.
    const nextTrackId = body.trackId === undefined ? existing.track_id : body.trackId;
    assertTrackBelongs(ctx.db, req.event.id, nextTrackId);

    const now = new Date().toISOString();
    ctx.db.transaction(() => {
      const speakerId = resolveSpeaker(ctx.db, req.event.id, body, existing.speaker_id);
      ctx.db
        .prepare(
          `UPDATE sessions SET room_id = ?, track_id = ?, type = ?, title = ?, description = ?,
                  speaker_id = ?, livestream_url = ?, starts_at = ?, ends_at = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(
          room.id,
          nextTrackId,
          type,
          body.title ?? existing.title,
          body.description ?? existing.description,
          speakerId,
          body.livestreamUrl ?? existing.livestream_url,
          window.startsAt.toISOString(),
          window.endsAt.toISOString(),
          now,
          existing.id,
        );
      if (body.tagIds) setTags(ctx, existing.id, body.tagIds);
    })();

    const dto = loadSessionDto(ctx.db, getSession(ctx.db, req.event.id, existing.id));
    audit(ctx.db, {
      identityId: req.identity.id,
      eventId: req.event.id,
      action: 'update',
      entity: 'session',
      entityId: existing.id,
    });
    ctx.broker.publish(req.event.slug, 'session.updated', dto);
    res.json(dto);
  });

  router.delete('/sessions/:id', ...userWrite, (req, res) => {
    const existing: SessionRow = getSession(ctx.db, req.event.id, Number(req.params.id));
    assertMayMutate(getPermissions(ctx.db, req.event.id), req.role, req.identity.id, existing);
    ctx.db
      .prepare('UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), new Date().toISOString(), existing.id);
    audit(ctx.db, {
      identityId: req.identity.id,
      eventId: req.event.id,
      action: 'delete',
      entity: 'session',
      entityId: existing.id,
    });
    ctx.broker.publish(req.event.slug, 'session.deleted', { id: existing.id });
    res.status(204).end();
  });

  return router;
}
