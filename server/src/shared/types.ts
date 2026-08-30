/** API payload types shared by the server and the web client. */

export type Role = 'viewer' | 'user' | 'speaker' | 'admin';
export type SessionType = 'official' | 'open';
export type ContributionKind = 'note' | 'link' | 'question';

export interface Me {
  id: number;
  /** The name you are offered when entering a new event. Inside an event the
   *  name that counts is `BundleDto.displayName`. */
  displayName: string;
  /** Role held per event slug. Absent slug = no access. */
  roles: Record<string, Role>;
  /** Public-demo instance: the gate offers roles as buttons, no password. */
  demoMode: boolean;
}

/** A short-lived phrase that lets another device adopt this identity. */
export interface LinkCodeDto {
  phrase: string;
  expiresAt: string;
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
  /** Longest event that still shows one flat strip of day tabs; above it the
   *  days split into a rail of weeks. */
  weekRailFrom: number;
  dayEndMin: number;
  /** What this event calls its middle role, e.g. "attendee". */
  userRoleLabel: string;
}

export interface RoomDto {
  id: number;
  name: string;
  description: string;
  capacity: number | null;
  /** Hex, from the ROOM_COLORS palette by default but free-form. */
  color: string;
  /** Attendees may schedule their own sessions in this room. */
  openBooking: boolean;
  sortOrder: number;
}

export interface TagDto {
  id: number;
  name: string;
  color: string;
}

export interface PersonLink {
  label: string;
  url: string;
}

export interface PersonDto {
  id: number;
  name: string;
  bio: string;
  links: PersonLink[];
  /** True when this profile belongs to the requesting identity. */
  isMine: boolean;
  /** True when some attendee owns it, so only they and organisers may edit. */
  claimed: boolean;
  updatedAt: string;
}

export interface PersonDetailDto {
  person: PersonDto;
  sessions: SessionDto[];
}

export interface SessionDto {
  id: number;
  roomId: number;
  /** null when the event has no tracks, or the session is not on one. */
  trackId: number | null;
  type: SessionType;
  title: string;
  description: string;
  /** Resolved from the linked person; empty when the session has no speaker. */
  speaker: string;
  speakerId: number | null;
  /** Watch-along link, http(s). Empty string means there is no stream, which
   *  is the default — the UI hides the field rather than showing it blank. */
  livestreamUrl: string;
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

export interface ProposalDto {
  id: number;
  title: string;
  description: string;
  speaker: string;
  speakerId: number | null;
  tagIds: number[];
  createdBy: number;
  createdByName: string;
  /** Set once an organiser has placed it on the grid. */
  placedSessionId: number | null;
  /** How many people said they would come. */
  interestCount: number;
  /** Whether the requesting identity is one of them. */
  interested: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A thematic strand across rooms and days. One per session at most, because
 *  the schedule can lay tracks out as its columns. */
export interface TrackDto {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
}

export interface BundleDto {
  event: EventDto;
  role: Role;
  /** What you go by inside this event. Names are unique per event, not
   *  globally, so this is not necessarily `Me.displayName`. */
  displayName: string;
  rooms: RoomDto[];
  tags: TagDto[];
  /** Empty unless the organiser has defined any. */
  tracks: TrackDto[];
  sessions: SessionDto[];
  people: PersonDto[];
  /** Pitches waiting for a slot, plus those already placed. */
  proposals: ProposalDto[];
  /** Sessions this identity has starred for their personal agenda. */
  starredSessionIds: number[];
  /** sessionId -> how many people starred it. An interest signal for
   *  organisers deciding which room a session deserves. */
  starCounts: Record<number, number>;
  /** sessionId -> count of visible contributions. */
  contributionCounts: Record<number, number>;
  /** capability -> roles allowed to use it. Admin is always present. */
  permissions: Record<string, Role[]>;
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
  | 'track.created'
  | 'track.updated'
  | 'track.deleted'
  | 'proposal.created'
  | 'proposal.updated'
  | 'proposal.deleted'
  | 'person.created'
  | 'person.updated'
  | 'person.deleted'
  | 'event.updated'
  | 'permissions.updated';

export interface ChangeEvent {
  type: ChangeType;
  /** Full fresh entity, or `{ id }` for deletes. */
  entity: unknown;
}

export interface ApiError {
  error: { code: string; message: string };
}
