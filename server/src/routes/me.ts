import { Router } from 'express';
import type { Me, Role } from '../shared/types.js';
import type { Ctx } from '../context.js';
import { limit } from '../ratelimit.js';
import { parse, renameSchema } from '../validation.js';

function rolesFor(ctx: Ctx, identityId: number): Record<string, Role> {
  const rows = ctx.db
    .prepare<[number], { slug: string; role: Role }>(
      `SELECT e.slug AS slug, r.role AS role
         FROM roles r JOIN events e ON e.id = r.event_id
        WHERE r.identity_id = ?`,
    )
    .all(identityId);
  return Object.fromEntries(rows.map((r) => [r.slug, r.role]));
}

export function meRoutes(ctx: Ctx): Router {
  const router = Router();

  const me = (identityId: number, displayName: string): Me => ({
    id: identityId,
    displayName,
    roles: rolesFor(ctx, identityId),
    demoMode: ctx.config.demoMode,
  });

  router.get('/me', limit(ctx.limiter, 'read'), (req, res) => {
    res.json(me(req.identity.id, req.identity.display_name));
  });

  router.patch('/me', limit(ctx.limiter, 'write'), (req, res) => {
    const { displayName } = parse(renameSchema, req.body);
    ctx.db
      .prepare('UPDATE identities SET display_name = ? WHERE id = ?')
      .run(displayName, req.identity.id);
    res.json(me(req.identity.id, displayName));
  });

  return router;
}
