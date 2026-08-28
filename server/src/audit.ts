import type { Db } from './db.js';

/** Append-only write log for post-hoc cleanup after vandalism (SPEC §8). */
export function audit(
  db: Db,
  entry: {
    identityId: number | null;
    eventId: number | null;
    action: string;
    entity: string;
    entityId: number | null;
  },
): void {
  db.prepare(
    'INSERT INTO audit (identity_id, event_id, action, entity, entity_id, at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    entry.identityId,
    entry.eventId,
    entry.action,
    entry.entity,
    entry.entityId,
    new Date().toISOString(),
  );
}
