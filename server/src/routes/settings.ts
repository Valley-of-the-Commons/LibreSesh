import { Router } from 'express';
import { hashPassword, requireRole, roleForPassword } from '../auth.js';
import { audit } from '../audit.js';
import type { Ctx } from '../context.js';
import type { EventRow } from '../db.js';
import type { Role } from '../shared/types.js';
import { badRequest, forbidden } from '../errors.js';
import { toEventDto } from '../mappers.js';
import { limit } from '../ratelimit.js';
import { getPermissions, setPermissions } from '../permissions.js';
import { authSchema, parse, permissionsSchema, settingsSchema } from '../validation.js';

export function settingsRoutes(ctx: Ctx): Router {
  const router = Router({ mergeParams: true });

  /**
   * Confirm the caller knows the organiser password. Grants nothing and
   * changes nothing — it exists so the UI can put a lock in front of controls
   * that are damaging to nudge by accident.
   *
   * Deliberately not `POST /auth`: that upserts a role, so an organiser who
   * typed the *viewer* password into a confirmation box would silently demote
   * themselves out of the page they were standing on.
   */
  router.post(
    '/confirm-admin',
    requireRole(ctx.db, 'admin'),
    limit(ctx.limiter, 'auth'),
    (req, res) => {
      const { password } = parse(authSchema, req.body);
      if (roleForPassword(req.event, password) !== 'admin') {
        throw forbidden('That is not the organiser password');
      }
      res.status(204).end();
    },
  );

  // Deliberately not behind `requireWritable`: un-archiving is how an admin
  // makes an archived event editable again.
  router.patch(
    '/settings',
    requireRole(ctx.db, 'admin'),
    limit(ctx.limiter, 'write'),
    (req, res) => {
      const body = parse(settingsSchema, req.body);
      const current = req.event;
      const startDate = body.startDate ?? current.start_date;
      const endDate = body.endDate ?? current.end_date;
      if (endDate < startDate) throw badRequest('End date must not be before the start date');

      const dayStartMin = body.dayStartMin ?? current.day_start_min;
      const dayEndMin = body.dayEndMin ?? current.day_end_min;
      if (dayEndMin <= dayStartMin) throw badRequest('Day end must be after day start');

      // The schema catches two *new* passwords matching each other, but not a
      // new one matching a role's existing password — only the stored hashes
      // can answer that. Leaving it would put two roles on one password, which
      // silently grants the higher of the two.
      // Only these three have passwords; `speaker` is granted by a code.
      const ROLE_LABELS: Partial<Record<Role, string>> = {
        viewer: 'viewer',
        user: 'attendee',
        admin: 'organiser',
      };
      const changes = [
        ['viewer', body.viewerPassword],
        ['user', body.userPassword],
        ['admin', body.adminPassword],
      ] as const;
      const alsoBeingReplaced = new Set<Role>(changes.filter(([, pw]) => pw).map(([role]) => role));
      for (const [role, password] of changes) {
        if (!password) continue;
        const held = roleForPassword(current, password);
        // A clash with a role whose password is being replaced in this same
        // request resolves itself, so only a role that is staying put matters.
        if (held && held !== role && !alsoBeingReplaced.has(held)) {
          throw badRequest(
            `That is already the ${ROLE_LABELS[held]} password — the ${ROLE_LABELS[role]} password must be different`,
          );
        }
      }

      ctx.db
        .prepare(
          `UPDATE events SET name = ?, start_date = ?, end_date = ?, day_start_min = ?,
                  day_end_min = ?, week_rail_from = ?, viewer_pw_hash = ?, user_pw_hash = ?, admin_pw_hash = ?,
                  archived = ?, user_role_label = ?
            WHERE id = ?`,
        )
        .run(
          body.name ?? current.name,
          startDate,
          endDate,
          dayStartMin,
          dayEndMin,
          body.weekRailFrom ?? current.week_rail_from,
          body.viewerPassword ? hashPassword(body.viewerPassword) : current.viewer_pw_hash,
          body.userPassword ? hashPassword(body.userPassword) : current.user_pw_hash,
          body.adminPassword ? hashPassword(body.adminPassword) : current.admin_pw_hash,
          body.archived === undefined ? current.archived : body.archived ? 1 : 0,
          body.userRoleLabel ?? current.user_role_label,
          current.id,
        );

      const updated = ctx.db
        .prepare<[number], EventRow>('SELECT * FROM events WHERE id = ?')
        .get(current.id) as EventRow;
      audit(ctx.db, {
        identityId: req.identity.id,
        eventId: current.id,
        action: 'update',
        entity: 'event',
        entityId: current.id,
      });
      const dto = toEventDto(updated);
      ctx.broker.publish(updated.slug, 'event.updated', dto);
      res.json(dto);
    },
  );

  /**
   * Replace this event's permission overrides. Admin-only, and admin is forced
   * back on for every capability inside `setPermissions` — an event nobody can
   * moderate would have no way back.
   */
  router.patch(
    '/permissions',
    requireRole(ctx.db, 'admin'),
    limit(ctx.limiter, 'write'),
    (req, res) => {
      const body = parse(permissionsSchema, req.body);
      setPermissions(ctx.db, req.event.id, body);
      const matrix = getPermissions(ctx.db, req.event.id);
      audit(ctx.db, {
        identityId: req.identity.id,
        eventId: req.event.id,
        action: 'update',
        entity: 'permissions',
        entityId: req.event.id,
      });
      ctx.broker.publish(req.event.slug, 'permissions.updated', matrix);
      res.json(matrix);
    },
  );

  return router;
}
