import type { Db } from './db.js';
import { badRequest } from './errors.js';

/** Collapse the whitespace people paste in: `" ada   lovelace "` → `"ada lovelace"`. */
export const normalizeSpeakerName = (raw: string): string => raw.trim().replace(/\s+/g, ' ');

/**
 * Turn a form's speaker input into a person id, shared by sessions and
 * proposals. A name that matches nobody creates a fresh unclaimed profile —
 * the tap is deliberately open so you can pitch a session for someone who has
 * not arrived yet — but the match is forgiving first: case-insensitive on the
 * normalised name, preferring a claimed profile over an unclaimed one, so
 * "ada lovelace" stops spawning a twin of "Ada Lovelace". (SQLite's lower()
 * folds ASCII only; "Ada" ≠ "ADÁ" is a shrug, not a bug — the admin merge
 * tool exists for the leftovers.)
 */
export function resolveSpeaker(
  db: Db,
  eventId: number,
  body: { speakerId?: number | null; speakerName?: string },
  current: number | null,
): number | null {
  if (body.speakerId !== undefined) {
    if (body.speakerId === null) return null;
    const found = db
      .prepare<[number, number], { id: number }>(
        'SELECT id FROM people WHERE id = ? AND event_id = ? AND deleted_at IS NULL',
      )
      .get(body.speakerId, eventId);
    if (!found) throw badRequest('Unknown speaker');
    return found.id;
  }

  if (body.speakerName === undefined) return current;
  const name = normalizeSpeakerName(body.speakerName);
  if (name === '') return null;

  const existing = db
    .prepare<[number, string], { id: number }>(
      `SELECT id FROM people
        WHERE event_id = ? AND deleted_at IS NULL AND lower(name) = lower(?)
        ORDER BY (identity_id IS NULL), id LIMIT 1`,
    )
    .get(eventId, name);
  if (existing) return existing.id;

  const now = new Date().toISOString();
  return Number(
    db
      .prepare(
        `INSERT INTO people (event_id, identity_id, name, bio, links, created_at, updated_at)
         VALUES (?, NULL, ?, '', '[]', ?, ?)`,
      )
      .run(eventId, name, now, now).lastInsertRowid,
  );
}
