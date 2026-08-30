import { Router } from 'express';
import { hashPassword, requireRole } from '../auth.js';
import { audit } from '../audit.js';
import type { Ctx } from '../context.js';
import type { EventRow } from '../db.js';
import { badRequest } from '../errors.js';
import { toEventDto } from '../mappers.js';
import { limit } from '../ratelimit.js';
import { getPermissions, setPermissions } from '../permissions.js';
import { parse, permissionsSchema, settingsSchema } from '../validation.js';

export function settingsRoutes(ctx: Ctx): Router {
  const router = Router({ mergeParams: true });

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

      ctx.db
        .prepare(
          `UPDATE events SET name = ?, start_date = ?, end_date = ?, day_start_min = ?,
                  day_end_min = ?, viewer_pw_hash = ?, user_pw_hash = ?, admin_pw_hash = ?,
                  archived = ?, user_role_label = ?
            WHERE id = ?`,
        )
        .run(
          body.name ?? current.name,
          startDate,
          endDate,
          dayStartMin,
          dayEndMin,
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
