import { useMemo } from 'react';
import type { RoomDto, SessionDto, TagDto } from '@shared/types';
import { fmtMin, place } from '../lib/format';

export interface ListViewProps {
  rooms: RoomDto[];
  tags: TagDto[];
  sessions: SessionDto[];
  contributionCounts: Record<number, number>;
  timezone: string;
  day: string;
  nowMin: number | null;
  onOpen: (id: number) => void;
}

/** Chronological agenda for one day, grouped by start time (SPEC §7.2). */
export function ListView({
  rooms,
  tags,
  sessions,
  contributionCounts,
  timezone,
  day,
  nowMin,
  onOpen,
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
          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-stone-500">
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
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onOpen(session.id)}
                  className={`block w-full rounded-xl border bg-white p-3 text-left shadow-sm hover:shadow ${
                    session.type === 'open' ? 'border-dashed border-emerald-400' : 'border-stone-200'
                  } ${live ? 'ring-2 ring-stone-900/10' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{session.title}</div>
                      <div className="mt-0.5 truncate text-xs text-stone-500">
                        {fmtMin(startMin)}–{fmtMin(endMin)} · {roomName.get(session.roomId) ?? '—'}
                        {session.speaker && ` · ${session.speaker}`}
                      </div>
                    </div>
                    {live && (
                      <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-xs font-bold">
                        now
                      </span>
                    )}
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
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                        open
                      </span>
                    )}
                    {count > 0 && (
                      <span className="ml-auto text-xs text-stone-400">
                        {count} contribution{count > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
