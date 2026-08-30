import type { Role } from './shared/types.js';
import { can, type PermissionMatrix } from './permissions.js';
import type { Db, EventRow, RoomRow, SessionRow } from './db.js';
import { badRequest, conflict, forbidden, notFound } from './errors.js';
import { durationMinutes, localDate, localMinuteOfDay } from './shared/time.js';

export const SNAP_MINUTES = 5;
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 480;

export interface TimeWindow {
  startsAt: Date;
  endsAt: Date;
}

export function getRoom(db: Db, eventId: number, roomId: number): RoomRow {
  const room = db
    .prepare<[number, number], RoomRow>(
      'SELECT * FROM rooms WHERE id = ? AND event_id = ? AND deleted_at IS NULL',
    )
    .get(roomId, eventId);
  if (!room) throw notFound('No such room');
  return room;
}

export function getSession(db: Db, eventId: number, sessionId: number): SessionRow {
  const row = db
    .prepare<[number, number], SessionRow>(
      'SELECT * FROM sessions WHERE id = ? AND event_id = ? AND deleted_at IS NULL',
    )
    .get(sessionId, eventId);
  if (!row) throw notFound('No such session');
  return row;
}

/** Reject tag ids that belong to another event or have been deleted. */
export function assertTagsBelong(db: Db, eventId: number, tagIds: number[]): void {
  if (tagIds.length === 0) return;
  const placeholders = tagIds.map(() => '?').join(',');
  const found = db
    .prepare<number[], { id: number }>(
      `SELECT id FROM tags WHERE event_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
    )
    .all(eventId, ...tagIds);
  if (found.length !== new Set(tagIds).size) throw badRequest('Unknown tag');
}

/**
 * Shape checks that apply to every writer: 5-minute snap in the event's
 * timezone and a sane duration (SPEC §5.1).
 */
export function assertValidTimes(event: EventRow, window: TimeWindow): void {
  const { startsAt, endsAt } = window;
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw badRequest('Invalid start or end time');
  }
  for (const [label, instant] of [
    ['Start', startsAt],
    ['End', endsAt],
  ] as const) {
    if (localMinuteOfDay(instant, event.timezone) % SNAP_MINUTES !== 0) {
      throw badRequest(`${label} time must land on a ${SNAP_MINUTES}-minute step`);
    }
    if (instant.getUTCSeconds() !== 0 || instant.getUTCMilliseconds() !== 0) {
      throw badRequest(`${label} time must land on a whole minute`);
    }
  }
  const minutes = durationMinutes(startsAt, endsAt);
  if (minutes < MIN_DURATION_MINUTES) {
    throw badRequest(`Sessions must run at least ${MIN_DURATION_MINUTES} minutes`);
  }
  if (minutes > MAX_DURATION_MINUTES) {
    throw badRequest(`Sessions may run at most ${MAX_DURATION_MINUTES} minutes`);
  }
}

/**
 * Extra placement limits for the `user` role: inside the event's dates and
 * inside the day viewport. Admins may place sessions anywhere.
 */
export function assertWithinEventWindow(event: EventRow, window: TimeWindow): void {
  const startDate = localDate(window.startsAt, event.timezone);
  const endDate = localDate(window.endsAt, event.timezone);
  if (startDate < event.start_date || startDate > event.end_date) {
    throw badRequest('That is outside the event dates');
  }
  const startMin = localMinuteOfDay(window.startsAt, event.timezone);
  let endMin = localMinuteOfDay(window.endsAt, event.timezone);
  // An end exactly at local midnight belongs to the day that is closing.
  if (endMin === 0 && endDate > startDate) endMin = 1440;
  if (endDate !== startDate && endMin !== 1440) {
    throw badRequest('Sessions must start and end on the same day');
  }
  if (startMin < event.day_start_min || endMin > event.day_end_min) {
    throw badRequest('That is outside the hours shown on the schedule');
  }
}

/**
 * Reject a session that would overlap another in the same room. Applied to
 * `user` writes only — admins may double-book, and the client badges the clash.
 */
export function assertNoOverlap(
  db: Db,
  eventId: number,
  roomId: number,
  window: TimeWindow,
  excludeSessionId?: number,
): void {
  const clash = db
    .prepare<[number, number, string, string, number], { id: number }>(
      `SELECT id FROM sessions
        WHERE event_id = ? AND room_id = ? AND deleted_at IS NULL
          AND starts_at < ? AND ends_at > ?
          AND id != ?`,
    )
    .get(
      eventId,
      roomId,
      window.endsAt.toISOString(),
      window.startsAt.toISOString(),
      excludeSessionId ?? -1,
    );
  if (clash) throw conflict('That slot is already taken in this room', 'overlap');
}

/**
 * Who may create a session of this type in this room (SPEC §3.2, §5.1).
 * Which roles hold `session.create_open` is per-event policy; the rest —
 * official sessions are organiser-only, open sessions need an open-track room
 * — is structural and not configurable.
 */
export function assertMayPlace(
  matrix: PermissionMatrix,
  role: Role,
  room: RoomRow,
  type: 'official' | 'open',
): void {
  if (role === 'admin') return;
  if (!can(matrix, role, 'session.create_open')) throw forbidden('You cannot add sessions');
  if (type !== 'open') throw forbidden('Only organisers can add official sessions');
  if (room.open_track !== 1) throw forbidden('That room is not an open track');
}

/** Who may edit or delete an existing session. */
export function assertMayMutate(
  matrix: PermissionMatrix,
  role: Role,
  identityId: number,
  session: SessionRow,
): void {
  if (role === 'admin') return;
  if (!can(matrix, role, 'session.edit_own')) throw forbidden('You cannot change sessions');
  if (session.created_by !== identityId) throw forbidden('That is not your session');
  if (session.type !== 'open') throw forbidden('Only organisers can change official sessions');
}

/** Optimistic concurrency: refuse a write built on a stale copy (SPEC §5.1). */
export function assertNotStale(session: SessionRow, expectedUpdatedAt?: string): void {
  if (!expectedUpdatedAt) return;
  if (session.updated_at !== expectedUpdatedAt) {
    throw conflict('Someone else changed this session while you were editing', 'stale');
  }
}
