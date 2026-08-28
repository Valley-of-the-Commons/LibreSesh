/** API payload types shared by the server and the web client. */

export type Role = 'viewer' | 'user' | 'admin';
export type SessionType = 'official' | 'open';
export type ContributionKind = 'note' | 'link' | 'question';

export interface Me {
  id: number;
  displayName: string;
  /** Role held per event slug. Absent slug = no access. */
  roles: Record<string, Role>;
}

export interface EventSummary {
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
  archived: boolean;
}

export interface EventDto extends EventSummary {
  id: number;
  timezone: string;
  dayStartMin: number;
  dayEndMin: number;
  /** What this event calls its middle role, e.g. "attendee". */
  userRoleLabel: string;
}

export interface RoomDto {
  id: number;
  name: string;
  description: string;
  capacity: number | null;
  openTrack: boolean;
  sortOrder: number;
}

export interface TagDto {
  id: number;
  name: string;
  color: string;
}

export interface SessionDto {
  id: number;
  roomId: number;
  type: SessionType;
  title: string;
  description: string;
  speaker: string;
  /** UTC ISO-8601. */
  startsAt: string;
  endsAt: string;
  tagIds: number[];
  createdBy: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContributionDto {
  id: number;
  sessionId: number;
  kind: ContributionKind;
  body: string;
  url: string | null;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  hidden: boolean;
}

export interface BundleDto {
  event: EventDto;
  role: Role;
  rooms: RoomDto[];
  tags: TagDto[];
  sessions: SessionDto[];
  /** sessionId -> count of visible contributions. */
  contributionCounts: Record<number, number>;
}

export interface SessionDetailDto {
  session: SessionDto;
  contributions: ContributionDto[];
}

/** SSE payloads (SPEC §6). */
export type ChangeType =
  | 'session.created'
  | 'session.updated'
  | 'session.deleted'
  | 'contribution.created'
  | 'contribution.deleted'
  | 'contribution.hidden'
  | 'room.created'
  | 'room.updated'
  | 'room.deleted'
  | 'tag.created'
  | 'tag.updated'
  | 'tag.deleted'
  | 'event.updated';

export interface ChangeEvent {
  type: ChangeType;
  /** Full fresh entity, or `{ id }` for deletes. */
  entity: unknown;
}

export interface ApiError {
  error: { code: string; message: string };
}
