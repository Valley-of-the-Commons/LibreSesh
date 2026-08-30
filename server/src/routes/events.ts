import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { EventRow } from '../db.js';
import { getEventBySlug, getRole, hashPassword, setRole } from '../auth.js';
import { audit } from '../audit.js';
import type { Ctx } from '../context.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { toEventSummary } from '../mappers.js';
import { limit } from '../ratelimit.js';
import { cloneEventSchema, createEventSchema, parse } from '../validation.js';

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Instance-level operations are gated by a single shared env password. */
function hasInstanceKey(ctx: Ctx, header: unknown): boolean {
  return typeof header === 'string' && constantTimeEquals(header, ctx.config.instanceAdminPassword);
}

export function eventRoutes(ctx: Ctx): Router {
  const router = Router();

  // Public: enough to render the landing page. No schedule data.
  router.get('/events', limit(ctx.limiter, 'read'), (_req, res) => {
    const rows = ctx.db
      .prepare<[], EventRow>('SELECT * FROM events ORDER BY start_date DESC, name ASC')
      .all();
    res.json(rows.map(toEventSummary));
  });

  router.post('/events', limit(ctx.limiter, 'write'), (req, res) => {
    if (!hasInstanceKey(ctx, req.get('X-Instance-Key'))) {
      throw forbidden('Wrong instance password');
    }
    const body = parse(createEventSchema, req.body);
    if (getEventBySlug(ctx.db, body.slug)) throw conflict('That slug is already taken', 'slug_taken');

    const now = new Date().toISOString();
    const info = ctx.db
      .prepare(
        `INSERT INTO events
          (slug, name, timezone, start_date, end_date, day_start_min, day_end_min,
           viewer_pw_hash, user_pw_hash, admin_pw_hash, archived, user_role_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        body.slug,
        body.name,
        body.timezone,
        body.startDate,
        body.endDate,
        body.dayStartMin ?? 480,
        body.dayEndMin ?? 1320,
        hashPassword(body.viewerPassword),
        hashPassword(body.userPassword),
        hashPassword(body.adminPassword),
        body.userRoleLabel ?? 'attendee',
        now,
      );

    const eventId = Number(info.lastInsertRowid);
    // The creator walks straight into their new event as its admin.
    setRole(ctx.db, req.identity.id, eventId, 'admin');
    audit(ctx.db, {
      identityId: req.identity.id,
      eventId,
      action: 'create',
      entity: 'event',
      entityId: eventId,
    });

    const row = ctx.db.prepare<[number], EventRow>('SELECT * FROM events WHERE id = ?').get(eventId);
    res.status(201).json(toEventSummary(row as EventRow));
  });

  /** Copy rooms and tags into a fresh event — never sessions or contributions. */
  router.post('/events/:slug/clone', limit(ctx.limiter, 'write'), (req, res) => {
    const source = getEventBySlug(ctx.db, req.params.slug ?? '');
    if (!source) throw notFound('No such event');

    const isEventAdmin = getRole(ctx.db, req.identity.id, source.id) === 'admin';
    if (!isEventAdmin && !hasInstanceKey(ctx, req.get('X-Instance-Key'))) {
      throw forbidden('Only this event’s admins can clone it');
    }

    const body = parse(cloneEventSchema, req.body);
    if (getEventBySlug(ctx.db, body.newSlug)) {
      throw conflict('That slug is already taken', 'slug_taken');
    }
    if (body.newSlug === source.slug) throw badRequest('Pick a different slug');

    const now = new Date().toISOString();
    const newId = ctx.db.transaction((): number => {
      const info = ctx.db
        .prepare(
          `INSERT INTO events
            (slug, name, timezone, start_date, end_date, day_start_min, day_end_min,
             viewer_pw_hash, user_pw_hash, admin_pw_hash, archived, user_role_label, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .run(
          body.newSlug,
          body.newName,
          source.timezone,
          body.startDate,
          body.endDate,
          source.day_start_min,
          source.day_end_min,
          hashPassword(body.viewerPassword),
          hashPassword(body.userPassword),
          hashPassword(body.adminPassword),
          source.user_role_label,
          now,
        );
      const id = Number(info.lastInsertRowid);
      ctx.db
        .prepare(
          `INSERT INTO rooms (event_id, name, description, capacity, color, open_track, sort_order)
           SELECT ?, name, description, capacity, color, open_track, sort_order
             FROM rooms WHERE event_id = ? AND deleted_at IS NULL`,
        )
        .run(id, source.id);
      ctx.db
        .prepare(
          `INSERT INTO tags (event_id, name, color)
           SELECT ?, name, color FROM tags WHERE event_id = ? AND deleted_at IS NULL`,
        )
        .run(id, source.id);
      return id;
    })();

    setRole(ctx.db, req.identity.id, newId, 'admin');
    audit(ctx.db, {
      identityId: req.identity.id,
      eventId: newId,
      action: 'clone',
      entity: 'event',
      entityId: source.id,
    });

    const row = ctx.db.prepare<[number], EventRow>('SELECT * FROM events WHERE id = ?').get(newId);
    res.status(201).json(toEventSummary(row as EventRow));
  });

  return router;
}
