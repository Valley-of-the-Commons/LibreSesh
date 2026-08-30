import { Router } from 'express';
import { clearRole, getRole, roleForPassword } from '../auth.js';
import { audit } from '../audit.js';
import type { Ctx } from '../context.js';
import { HttpError, forbidden } from '../errors.js';
import { LIMITS, keysFor } from '../ratelimit.js';
import { authSchema, demoAuthSchema, parse } from '../validation.js';

/**
 * Password gate for an event. Mounted before the viewer requirement, since
 * this is how a visitor earns a role in the first place.
 */
export function eventAuthRoutes(ctx: Ctx): Router {
  const router = Router({ mergeParams: true });

  const grant = (identityId: number, eventId: number, role: string): void => {
    ctx.db
      .prepare(
        `INSERT INTO roles (identity_id, event_id, role, granted_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(identity_id, event_id) DO UPDATE SET role = excluded.role, granted_at = excluded.granted_at`,
      )
      .run(identityId, eventId, role, new Date().toISOString());
  };

  router.post('/auth', (req, res) => {
    // On a demo instance the gate is a role picker, not a password prompt.
    // There is no secret to brute-force here, so no rate limiting either.
    if (ctx.config.demoMode) {
      const { role } = parse(demoAuthSchema, req.body);
      grant(req.identity.id, req.event.id, role);
      audit(ctx.db, {
        identityId: req.identity.id,
        eventId: req.event.id,
        action: 'auth_demo',
        entity: 'event',
        entityId: req.event.id,
      });
      res.json({ role });
      return;
    }

    // Hand-rolled instead of the `limit` middleware so a correct password can
    // refund its token — switching roles shouldn't burn the lockout budget.
    const keys = keysFor('auth', req);
    let retryAfter = 0;
    for (const key of keys) {
      retryAfter = Math.max(retryAfter, ctx.limiter.consume(key, LIMITS.auth));
    }
    if (retryAfter > 0) {
      res.setHeader('Retry-After', String(retryAfter));
      throw new HttpError(429, 'rate_limited', 'Too many password attempts — try again later');
    }

    const { password } = parse(authSchema, req.body);
    const role = roleForPassword(req.event, password);
    if (!role) {
      audit(ctx.db, {
        identityId: req.identity.id,
        eventId: req.event.id,
        action: 'auth_failed',
        entity: 'event',
        entityId: req.event.id,
      });
      throw forbidden('That password does not match');
    }

    for (const key of keys) ctx.limiter.refund(key, LIMITS.auth);
    grant(req.identity.id, req.event.id, role);
    res.json({ role });
  });

  router.post('/logout', (req, res) => {
    if (getRole(ctx.db, req.identity.id, req.event.id)) {
      clearRole(ctx.db, req.identity.id, req.event.id);
    }
    res.status(204).end();
  });

  return router;
}
