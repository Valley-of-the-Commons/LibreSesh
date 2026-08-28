import type {
  ContributionDto,
  EventDto,
  EventSummary,
  RoomDto,
  SessionDto,
  TagDto,
} from './shared/types.js';
import type { ContributionRow, Db, EventRow, RoomRow, SessionRow, TagRow } from './db.js';

export const toEventSummary = (e: EventRow): EventSummary => ({
  slug: e.slug,
  name: e.name,
  startDate: e.start_date,
  endDate: e.end_date,
  archived: e.archived === 1,
});

export const toEventDto = (e: EventRow): EventDto => ({
  ...toEventSummary(e),
  id: e.id,
  timezone: e.timezone,
  dayStartMin: e.day_start_min,
  dayEndMin: e.day_end_min,
  userRoleLabel: e.user_role_label,
});

export const toRoomDto = (r: RoomRow): RoomDto => ({
  id: r.id,
  name: r.name,
  description: r.description,
  capacity: r.capacity,
  openTrack: r.open_track === 1,
  sortOrder: r.sort_order,
});

export const toTagDto = (t: TagRow): TagDto => ({ id: t.id, name: t.name, color: t.color });

/** Cheap per-request cache so a bundle resolves each author name once. */
export class NameResolver {
  private readonly cache = new Map<number, string>();
  private readonly stmt;

  constructor(db: Db) {
    this.stmt = db.prepare<[number], { display_name: string }>(
      'SELECT display_name FROM identities WHERE id = ?',
    );
  }

  get(identityId: number): string {
    const hit = this.cache.get(identityId);
    if (hit !== undefined) return hit;
    const name = this.stmt.get(identityId)?.display_name ?? 'unknown';
    this.cache.set(identityId, name);
    return name;
  }
}

export function tagIdsBySession(db: Db, sessionIds: number[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  if (sessionIds.length === 0) return out;
  const placeholders = sessionIds.map(() => '?').join(',');
  const rows = db
    .prepare<number[], { session_id: number; tag_id: number }>(
      `SELECT session_id, tag_id FROM session_tags WHERE session_id IN (${placeholders})`,
    )
    .all(...sessionIds);
  for (const row of rows) {
    const list = out.get(row.session_id);
    if (list) list.push(row.tag_id);
    else out.set(row.session_id, [row.tag_id]);
  }
  return out;
}

export function toSessionDto(row: SessionRow, tagIds: number[], authorName: string): SessionDto {
  return {
    id: row.id,
    roomId: row.room_id,
    type: row.type,
    title: row.title,
    description: row.description,
    speaker: row.speaker,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    tagIds,
    createdBy: row.created_by,
    createdByName: authorName,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Load one session as a DTO (tags + author name resolved). */
export function loadSessionDto(db: Db, row: SessionRow): SessionDto {
  const tagIds = tagIdsBySession(db, [row.id]).get(row.id) ?? [];
  const names = new NameResolver(db);
  return toSessionDto(row, tagIds, names.get(row.created_by));
}

export function toContributionDto(row: ContributionRow, authorName: string): ContributionDto {
  return {
    id: row.id,
    sessionId: row.session_id,
    kind: row.kind,
    body: row.body,
    url: row.url,
    createdBy: row.created_by,
    createdByName: authorName,
    createdAt: row.created_at,
    hidden: row.hidden === 1,
  };
}
