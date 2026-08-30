import { Router } from 'express';
import { atLeast, requireRole, requireWritable } from '../auth.js';
import { audit } from '../audit.js';
import type { Ctx } from '../context.js';
import type { PersonRow, SessionRow } from '../db.js';
import { conflict, forbidden, notFound } from '../errors.js';
import { loadSessionDto, toPersonDto } from '../mappers.js';
import { requireCapability } from '../permissions.js';
import { limit } from '../ratelimit.js';
import { myProfileSchema, parse, personPatchSchema, personSchema } from '../validation.js';
import type { PersonDetailDto } from '../shared/types.js';

/**
 * Speaker and host profiles, scoped to one event (SPEC follow-up to §4).
 * Organisers curate the roster; an attendee owns at most one profile per event
 * and may edit that one whatever their role — viewers included.
 */
export function peopleRoutes(ctx: Ctx): Router {
  const router = Router({ mergeParams: true });

  const load = (eventId: number, id: number): PersonRow => {
    const row = ctx.db
      .prepare<[number, number], PersonRow>(
        'SELECT * FROM people WHERE id = ? AND event_id = ? AND deleted_at IS NULL',
      )
      .get(id, eventId);
    if (!row) throw notFound('No such profile');
    return row;
  };

  const nameClash = (eventId: number, name: string, excludeId?: number): PersonRow | undefined =>
    ctx.db
      .prepare<[number, string, number], PersonRow>(
        'SELECT * FROM people WHERE event_id = ? AND name = ? AND deleted_at IS NULL AND id != ?',
      )
      .get(eventId, name, excludeId ?? -1);

  const write = (row: PersonRow, patch: { name?: string; bio?: string; links?: unknown[] }) => {
    ctx.db
      .prepare('UPDATE people SET name = ?, bio = ?, links = ?, updated_at = ? WHERE id = ?')
      .run(
        patch.name ?? row.name,
        patch.bio ?? row.bio,
        patch.links === undefined ? row.links : JSON.stringify(patch.links),
        new Date().toISOString(),
        row.id,
      );
  };

  router.get('/people/:id', limit(ctx.limiter, 'read'), (req, res) => {
    const person = load(req.event.id, Number(req.params.id));
    const sessions = ctx.db
      .prepare<[number, number], SessionRow>(
        'SELECT * FROM sessions WHERE event_id = ? AND speaker_id = ? AND deleted_at IS NULL ORDER BY starts_at',
      )
      .all(req.event.id, person.id);

    const detail: PersonDetailDto = {
      person: toPersonDto(person, req.identity.id),
      sessions: sessions.map((s) => loadSessionDto(ctx.db, s)),
    };
    res.json(detail);
  });

  /** Your own profile for this event, created on first edit. */
  router.patch(
    '/me/profile',
    requireCapability(ctx.db, 'person.edit_own'),
    requireWritable,
    limit(ctx.limiter, 'write'),
    (req, res) => {
      const body = parse(myProfileSchema, req.body);
      const existing = ctx.db
        .prepare<[number, number], PersonRow>(
          'SELECT * FROM people WHERE event_id = ? AND identity_id = ? AND deleted_at IS NULL',
        )
        .get(req.event.id, req.identity.id);

      const name = body.name ?? existing?.name ?? req.identity.display_name;
      const clash = nameClash(req.event.id, name, existing?.id);
      // Naming yourself as the speaker on a session or a pitch auto-creates an
      // unclaimed person under your display name. Refusing the collision would
      // lock you out of your own profile for good, since every retry defaults
      // to the same name — so claim that record instead. It is the same person,
      // and it folds the speaker entry into the profile.
      if (clash && clash.identity_id !== null) {
        throw conflict('Someone else here already goes by that name', 'name_taken');
      }

      let id: number;
      if (existing) {
        write(existing, { ...body, name });
        id = existing.id;
      } else if (clash) {
        ctx.db
          .prepare('UPDATE people SET identity_id = ? WHERE id = ?')
          .run(req.identity.id, clash.id);
        write(clash, { ...body, name });
        id = clash.id;
      } else {
        const now = new Date().toISOString();
        id = Number(
          ctx.db
            .prepare(
              `INSERT INTO people (event_id, identity_id, name, bio, links, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              req.event.id,
              req.identity.id,
              name,
              body.bio ?? '',
              JSON.stringify(body.links ?? []),
              now,
              now,
            ).lastInsertRowid,
        );
      }

      const dto = toPersonDto(load(req.event.id, id), req.identity.id);
      audit(ctx.db, {
        identityId: req.identity.id,
        eventId: req.event.id,
        action: existing ? 'update' : 'create',
        entity: 'person',
        entityId: id,
      });
      ctx.broker.publish(req.event.slug, existing ? 'person.updated' : 'person.created', dto);
      res.status(existing ? 200 : 201).json(dto);
    },
  );

  router.post(
    '/people',
    requireRole(ctx.db, 'admin'),
    requireWritable,
    limit(ctx.limiter, 'write'),
    (req, res) => {
      const body = parse(personSchema, req.body);
      if (nameClash(req.event.id, body.name)) {
        throw conflict('Someone here already goes by that name', 'name_taken');
      }
      const now = new Date().toISOString();
      const id = Number(
        ctx.db
          .prepare(
            `INSERT INTO people (event_id, identity_id, name, bio, links, created_at, updated_at)
             VALUES (?, NULL, ?, ?, ?, ?, ?)`,
          )
          .run(
            req.event.id,
            body.name,
            body.bio ?? '',
            JSON.stringify(body.links ?? []),
            now,
            now,
          ).lastInsertRowid,
      );
      const dto = toPersonDto(load(req.event.id, id), req.identity.id);
      audit(ctx.db, {
        identityId: req.identity.id,
        eventId: req.event.id,
        action: 'create',
        entity: 'person',
        entityId: id,
      });
      ctx.broker.publish(req.event.slug, 'person.created', dto);
      res.status(201).json(dto);
    },
  );

  router.patch(
    '/people/:id',
    requireRole(ctx.db, 'viewer'),
    requireWritable,
    limit(ctx.limiter, 'write'),
    (req, res) => {
      const person = load(req.event.id, Number(req.params.id));
      // Organisers edit anyone; everyone else edits only the profile they own.
      const mine = person.identity_id !== null && person.identity_id === req.identity.id;
      if (!atLeast(req.role, 'admin') && !mine) {
        throw forbidden('That is not your profile');
      }

      const body = parse(personPatchSchema, req.body);
      if (body.name && nameClash(req.event.id, body.name, person.id)) {
        throw conflict('Someone here already goes by that name', 'name_taken');
      }
      write(person, body);

      const dto = toPersonDto(load(req.event.id, person.id), req.identity.id);
      audit(ctx.db, {
        identityId: req.identity.id,
        eventId: req.event.id,
        action: 'update',
        entity: 'person',
        entityId: person.id,
      });
      ctx.broker.publish(req.event.slug, 'person.updated', dto);
      res.json(dto);
    },
  );

  router.delete(
    '/people/:id',
    requireRole(ctx.db, 'admin'),
    requireWritable,
    limit(ctx.limiter, 'write'),
    (req, res) => {
      const person = load(req.event.id, Number(req.params.id));
      // Sessions keep their slot; they just lose the speaker.
      ctx.db.transaction(() => {
        ctx.db.prepare('UPDATE sessions SET speaker_id = NULL WHERE speaker_id = ?').run(person.id);
        ctx.db
          .prepare('UPDATE people SET deleted_at = ? WHERE id = ?')
          .run(new Date().toISOString(), person.id);
      })();
      audit(ctx.db, {
        identityId: req.identity.id,
        eventId: req.event.id,
        action: 'delete',
        entity: 'person',
        entityId: person.id,
      });
      ctx.broker.publish(req.event.slug, 'person.deleted', { id: person.id });
      res.status(204).end();
    },
  );

  return router;
}
