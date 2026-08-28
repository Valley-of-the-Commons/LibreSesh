import type {
  BundleDto,
  ContributionDto,
  EventDto,
  EventSummary,
  Me,
  Role,
  RoomDto,
  SessionDetailDto,
  SessionDto,
  TagDto,
} from '@shared/types';

/** Error carrying the server's machine-readable code, so callers can react to
 *  `stale`, `overlap` or `rate_limited` specifically. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const payload: unknown = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const err = payload as { error?: { code?: string; message?: string } } | undefined;
    const retryAfter = Number(res.headers.get('Retry-After')) || undefined;
    throw new ApiError(
      res.status,
      err?.error?.code ?? 'unknown',
      err?.error?.message ?? 'Something went wrong',
      retryAfter,
    );
  }
  return payload as T;
}

const encode = encodeURIComponent;

export const api = {
  me: () => request<Me>('GET', '/me'),
  rename: (displayName: string) => request<Me>('PATCH', '/me', { displayName }),

  listEvents: () => request<EventSummary[]>('GET', '/events'),
  createEvent: (
    instanceKey: string,
    body: {
      name: string;
      slug: string;
      timezone: string;
      startDate: string;
      endDate: string;
      viewerPassword: string;
      userPassword: string;
      adminPassword: string;
    },
  ) => request<EventSummary>('POST', '/events', body, { 'X-Instance-Key': instanceKey }),
  cloneEvent: (
    slug: string,
    body: {
      newSlug: string;
      newName: string;
      startDate: string;
      endDate: string;
      viewerPassword: string;
      userPassword: string;
      adminPassword: string;
    },
    instanceKey?: string,
  ) =>
    request<EventSummary>(
      'POST',
      `/events/${encode(slug)}/clone`,
      body,
      instanceKey ? { 'X-Instance-Key': instanceKey } : {},
    ),

  authenticate: (slug: string, password: string) =>
    request<{ role: Role }>('POST', `/e/${encode(slug)}/auth`, { password }),
  logout: (slug: string) => request<void>('POST', `/e/${encode(slug)}/logout`),

  bundle: (slug: string) => request<BundleDto>('GET', `/e/${encode(slug)}/bundle`),
  session: (slug: string, id: number) =>
    request<SessionDetailDto>('GET', `/e/${encode(slug)}/sessions/${id}`),

  createRoom: (slug: string, body: Partial<RoomDto> & { name: string }) =>
    request<RoomDto>('POST', `/e/${encode(slug)}/rooms`, body),
  updateRoom: (slug: string, id: number, body: Partial<RoomDto>) =>
    request<RoomDto>('PATCH', `/e/${encode(slug)}/rooms/${id}`, body),
  deleteRoom: (slug: string, id: number) =>
    request<void>('DELETE', `/e/${encode(slug)}/rooms/${id}`),

  createTag: (slug: string, body: { name: string; color?: string }) =>
    request<TagDto>('POST', `/e/${encode(slug)}/tags`, body),
  updateTag: (slug: string, id: number, body: Partial<TagDto>) =>
    request<TagDto>('PATCH', `/e/${encode(slug)}/tags/${id}`, body),
  deleteTag: (slug: string, id: number) => request<void>('DELETE', `/e/${encode(slug)}/tags/${id}`),

  createSession: (slug: string, body: SessionWrite) =>
    request<SessionDto>('POST', `/e/${encode(slug)}/sessions`, body),
  updateSession: (slug: string, id: number, body: Partial<SessionWrite> & { expectedUpdatedAt?: string }) =>
    request<SessionDto>('PATCH', `/e/${encode(slug)}/sessions/${id}`, body),
  deleteSession: (slug: string, id: number) =>
    request<void>('DELETE', `/e/${encode(slug)}/sessions/${id}`),

  addContribution: (
    slug: string,
    sessionId: number,
    body: { kind: 'note' | 'link' | 'question'; body: string; url?: string },
  ) => request<ContributionDto>('POST', `/e/${encode(slug)}/sessions/${sessionId}/contributions`, body),
  deleteContribution: (slug: string, id: number) =>
    request<void>('DELETE', `/e/${encode(slug)}/contributions/${id}`),
  setContributionHidden: (slug: string, id: number, hidden: boolean) =>
    request<ContributionDto>('PATCH', `/e/${encode(slug)}/contributions/${id}/hidden`, { hidden }),

  updateSettings: (slug: string, body: SettingsWrite) =>
    request<EventDto>('PATCH', `/e/${encode(slug)}/settings`, body),
};

export interface SessionWrite {
  roomId: number;
  type?: 'official' | 'open';
  title: string;
  description?: string;
  speaker?: string;
  startsAt: string;
  endsAt: string;
  tagIds?: number[];
}

export interface SettingsWrite {
  name?: string;
  startDate?: string;
  endDate?: string;
  dayStartMin?: number;
  dayEndMin?: number;
  viewerPassword?: string;
  userPassword?: string;
  adminPassword?: string;
  archived?: boolean;
}
