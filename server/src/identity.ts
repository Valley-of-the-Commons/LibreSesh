import { randomInt } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Db, IdentityRow } from './db.js';

const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const LOWER36 = 'abcdefghijklmnopqrstuvwxyz0123456789';

export const COOKIE_NAME = 'cid';
const TOKEN_LENGTH = 22;
/** Cookie lifetime: long enough that an attendee keeps their name all conference. */
const COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

function randomString(length: number, alphabet: string): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export const newIdentityToken = (): string => randomString(TOKEN_LENGTH, BASE62);

/** One place for the cookie's attributes: minting on first contact and
 *  adopting another device's identity must set exactly the same cookie. */
export function setIdentityCookie(res: Response, token: string, isProd: boolean): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });
}
/** Suffixed so two people in the same room can tell each other apart. */
export const newDisplayName = (): string => `attendee_${randomString(5, LOWER36)}`;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      identity: IdentityRow;
    }
  }
}

export function findIdentityByToken(db: Db, token: string): IdentityRow | undefined {
  return db
    .prepare<[string], IdentityRow>('SELECT * FROM identities WHERE token = ?')
    .get(token);
}

/**
 * Resolves `req.identity` from the signed `cid` cookie, minting a new anonymous
 * identity (and setting the cookie) on first contact. Runs before everything
 * else so even rate-limit rejections are attributable.
 */
export function identityMiddleware(db: Db, isProd: boolean) {
  const insert = db.prepare(
    'INSERT INTO identities (token, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)',
  );
  const touch = db.prepare('UPDATE identities SET last_seen_at = ? WHERE id = ?');

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = new Date().toISOString();
    // `false` is what cookie-parser puts here when the signature does not
    // verify — a tampered cookie, or one signed with a previous secret. Both
    // mean "no identity", so the falsy test below is the whole check.
    const cookieToken = req.signedCookies?.[COOKIE_NAME] as string | false | undefined;

    let identity = cookieToken ? findIdentityByToken(db, cookieToken) : undefined;

    if (!identity) {
      const token = newIdentityToken();
      const displayName = newDisplayName();
      const info = insert.run(token, displayName, now, now);
      identity = {
        id: Number(info.lastInsertRowid),
        token,
        display_name: displayName,
        created_at: now,
        last_seen_at: now,
        ics_token: null,
      };
      setIdentityCookie(res, token, isProd);
    } else if (identity.last_seen_at.slice(0, 16) !== now.slice(0, 16)) {
      // Throttle the write to once a minute — this runs on every request.
      touch.run(now, identity.id);
      identity.last_seen_at = now;
    }

    req.identity = identity;
    next();
  };
}
