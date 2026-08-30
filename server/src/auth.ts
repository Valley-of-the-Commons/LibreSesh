import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import type { Role } from './shared/types.js';
import type { Db, EventRow } from './db.js';
import { conflict, forbidden, notFound, unauthorized } from './errors.js';

/** Cost 10 is right at this scale; tests lower it so suites stay fast. */
export const BCRYPT_COST = Number(process.env.BCRYPT_COST ?? 10);

const RANK: Record<Role, number> = { viewer: 1, user: 2, speaker: 3, admin: 4 };

export const atLeast = (role: Role, min: Role): boolean => RANK[role] >= RANK[min];

export const hashPassword = (plain: string): string => bcrypt.hashSync(plain, BCRYPT_COST);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      event: EventRow;
      role: Role;
    }
  }
}

export function getEventBySlug(db: Db, slug: string): EventRow | undefined {
  return db.prepare<[string], EventRow>('SELECT * FROM events WHERE slug = ?').get(slug);
}

export function getRole(db: Db, identityId: number, eventId: number): Role | undefined {
  const row = db
    .prepare<[number, number], { role: Role }>(
      'SELECT role FROM roles WHERE identity_id = ? AND event_id = ?',
    )
    .get(identityId, eventId);
  return row?.role;
}

export function setRole(db: Db, identityId: number, eventId: number, role: Role): void {
  db.prepare(
    `INSERT INTO roles (identity_id, event_id, role, granted_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(identity_id, event_id) DO UPDATE SET role = excluded.role, granted_at = excluded.granted_at`,
  ).run(identityId, eventId, role, new Date().toISOString());
}

export function clearRole(db: Db, identityId: number, eventId: number): void {
  db.prepare('DELETE FROM roles WHERE identity_id = ? AND event_id = ?').run(
    identityId,
    eventId,
  );
}

/**
 * Check a submitted password against the event's three hashes, highest first,
 * so entering the admin password grants admin even if two passwords match.
 * Returns the granted role, or undefined on no match.
 */
export function roleForPassword(event: EventRow, password: string): Role | undefined {
  if (bcrypt.compareSync(password, event.admin_pw_hash)) return 'admin';
  if (bcrypt.compareSync(password, event.user_pw_hash)) return 'user';
  if (bcrypt.compareSync(password, event.viewer_pw_hash)) return 'viewer';
  return undefined;
}

/** Resolve `:slug` into `req.event`. */
export function loadEvent(db: Db) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const event = getEventBySlug(db, req.params.slug ?? '');
    if (!event) {
      next(notFound('No such event'));
      return;
    }
    req.event = event;
    next();
  };
}

/** Require at least `min` on `req.event`; 401 when no role at all. */
export function requireRole(db: Db, min: Role) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = getRole(db, req.identity.id, req.event.id);
    if (!role) {
      next(unauthorized());
      return;
    }
    req.role = role;
    if (!atLeast(role, min)) {
      next(forbidden());
      return;
    }
    next();
  };
}

/** Block writes to an archived event (SPEC §3.3). */
export function requireWritable(req: Request, _res: Response, next: NextFunction): void {
  if (req.event.archived) {
    next(conflict('This event is archived and read-only', 'archived'));
    return;
  }
  next();
}
