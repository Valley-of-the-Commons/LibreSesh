import { useMemo } from 'react';
import type { RoomDto, SessionDto, TagDto } from '@shared/types';
import { fmtMin, place } from '../lib/format';

export interface ListViewProps {
  rooms: RoomDto[];
  tags: TagDto[];
  sessions: SessionDto[];
  contributionCounts: Record<number, number>;
  /** Sessions on the current identity's personal agenda. */
  starredIds: Set<number>;
  timezone: string;
  day: string;
  nowMin: number | null;
  onOpen: (id: number) => void;
  onToggleStar: (session: SessionDto) => void;
}

/** Chronological agenda for one day, grouped by start time (SPEC §7.2). */
export function ListView({
  rooms,
  tags,
  sessions,
  contributionCounts,
  starredIds,
  timezone,
  day,
  nowMin,
  onOpen,
  onToggleStar,
}: ListViewProps) {
  const roomName = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const groups = useMemo(() => {
    const placed = sessions
      .map((session) => ({ session, ...place(session, timezone) }))
      .filter((p) => p.date === day)
      .sort((a, b) => a.startMin - b.startMin || a.session.roomId - b.session.roomId);

    const out: { start: number; items: typeof placed }[] = [];
    for (const item of placed) {
      const last = out[out.length - 1];
      if (last && last.start === item.startMin) last.items.push(item);
      else out.push({ start: item.startMin, items: [item] });
    }
    return out;
  }, [sessions, timezone, day]);

  // The first group that has not finished yet is where "Now" scrolls to.
  const nowGroupIndex =
    nowMin === null
      ? -1
      : groups.findIndex((g) => Math.max(...g.items.map((i) => i.endMin)) > nowMin);

  return (
    <div className="px-4 pb-24 pt-3">
      {groups.map((group, index) => (
        <div key={group.start} id={index === nowGroupIndex ? 'now-anchor' : undefined} className="mb-4">
          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
            {fmtMin(group.start)}
            {index === nowGroupIndex && (
              <span className="rounded bg-accent px-1.5 py-0.5 font-bold text-stone-900">
                next / now
              </span>
            )}
          </div>
          <div className="space-y-2">
            {group.items.map(({ session, startMin, endMin }) => {
              const live = nowMin !== null && nowMin >= startMin && nowMin < endMin;
              const count = contributionCounts[session.id] ?? 0;
              const starred = starredIds.has(session.id);
              return (
                // A div, not a button, so the star can be a real nested button.
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(session.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpen(session.id);
                    }
                  }}
                  className={`block w-full cursor-pointer rounded-xl border bg-white dark:bg-stone-900 p-3 text-left shadow-sm hover:shadow ${
                    session.type === 'open' ? 'border-dashed border-emerald-400 dark:border-emerald-500' : 'border-stone-200 dark:border-stone-700'
                  } ${live ? 'ring-2 ring-stone-900/10 dark:ring-stone-100/10' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{session.title}</div>
                      <div className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
                        {fmtMin(startMin)}–{fmtMin(endMin)} · {roomName.get(session.roomId) ?? '—'}
                        {session.speaker && ` · ${session.speaker}`}
                      </div>
                    </div>
                    {live && (
                      <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-xs font-bold text-stone-900">
                        now
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={starred ? `Unstar ${session.title}` : `Star ${session.title}`}
                      aria-pressed={starred}
                      onClick={(e) => {
                        // Do not let the tap fall through and open the session.
                        e.stopPropagation();
                        onToggleStar(session);
                      }}
                      className={`-m-1 shrink-0 rounded-full p-1 text-base leading-none ${
                        starred ? 'text-amber-500 dark:text-amber-400' : 'text-stone-300 dark:text-stone-600 hover:text-amber-500'
                      }`}
                    >
                      <span aria-hidden="true">{starred ? '★' : '☆'}</span>
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {session.tagIds.map((id) => {
                      const tag = tagById.get(id);
                      if (!tag) return null;
                      return (
                        <span
                          key={id}
                          className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ background: tag.color }}
                        >
                          {tag.name}
                        </span>
                      );
                    })}
                    {session.type === 'open' && (
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                        open
                      </span>
                    )}
                    {count > 0 && (
                      <span className="ml-auto text-xs text-stone-400 dark:text-stone-500">
                        {count} contribution{count > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
