import type { NextFunction, Request, Response } from 'express';
import type { Role } from './shared/types.js';
import {
  CAPABILITIES,
  CAPABILITY_IDS,
  can,
  isCapability,
  type Capability,
  type PermissionMatrix,
} from './shared/capabilities.js';
import type { Db } from './db.js';
import { forbidden, unauthorized } from './errors.js';

export { CAPABILITIES, CAPABILITY_IDS, can };
export type { Capability, PermissionMatrix };

/**
 * The things an organiser can hand out or withhold. Everything not listed here
 * is fixed: managing rooms, tags, settings and the trash is always admin-only,
 * because those are how an event is administered at all.
 */
const ROLE_ORDER: Role[] = ['viewer', 'user', 'speaker', 'admin'];

function defaultMatrix(): PermissionMatrix {
  const out = {} as PermissionMatrix;
  for (const cap of CAPABILITIES) out[cap.id] = [...cap.defaults];
  return out;
}

/**
 * Defaults, with this event's stored overrides applied on top.
 *
 * Admin is forced on for every capability. An organiser who could switch admin
 * off for `contribution.moderate` would produce an event nobody can moderate
 * and nobody can repair — the matrix is for deciding what viewers and
 * attendees may do, not for disarming administration.
 */
export function getPermissions(db: Db, eventId: number): PermissionMatrix {
  const matrix = defaultMatrix();
  const rows = db
    .prepare<[number], { capability: string; role: Role; allowed: number }>(
      'SELECT capability, role, allowed FROM event_permissions WHERE event_id = ?',
    )
    .all(eventId);

  for (const row of rows) {
    if (!isCapability(row.capability)) continue; // a capability we have since dropped
    if (row.role === 'admin') continue;
    const current = new Set(matrix[row.capability]);
    if (row.allowed === 1) current.add(row.role);
    else current.delete(row.role);
    matrix[row.capability] = ROLE_ORDER.filter((r) => current.has(r));
  }

  for (const cap of CAPABILITY_IDS) {
    if (!matrix[cap].includes('admin')) matrix[cap] = [...matrix[cap], 'admin'];
  }
  return matrix;
}

/** Replace this event's overrides with `next`, keeping only real differences. */
export function setPermissions(db: Db, eventId: number, next: Partial<PermissionMatrix>): void {
  const defaults = defaultMatrix();
  const write = db.transaction(() => {
    for (const [capability, roles] of Object.entries(next)) {
      if (!isCapability(capability) || !roles) continue;
      db.prepare('DELETE FROM event_permissions WHERE event_id = ? AND capability = ?').run(
        eventId,
        capability,
      );
      const allowed = new Set(roles);
      for (const role of ROLE_ORDER) {
        if (role === 'admin') continue; // always on, never stored
        const isAllowed = allowed.has(role);
        if (isAllowed === defaults[capability].includes(role)) continue; // same as default
        db.prepare(
          `INSERT INTO event_permissions (event_id, capability, role, allowed)
           VALUES (?, ?, ?, ?)`,
        ).run(eventId, capability, role, isAllowed ? 1 : 0);
      }
    }
  });
  write();
}

/**
 * Require a capability on `req.event`. Mirrors `requireRole`: 401 when the
 * visitor holds no role on this event at all, 403 when their role is not
 * allowed this capability.
 */
export function requireCapability(db: Db, capability: Capability) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const row = db
      .prepare<[number, number], { role: Role }>(
        'SELECT role FROM roles WHERE identity_id = ? AND event_id = ?',
      )
      .get(req.identity.id, req.event.id);
    if (!row) {
      next(unauthorized());
      return;
    }
    req.role = row.role;
    if (!can(getPermissions(db, req.event.id), row.role, capability)) {
      next(forbidden());
      return;
    }
    next();
  };
}
