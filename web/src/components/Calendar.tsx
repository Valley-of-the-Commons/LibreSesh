import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { RoomDto, SessionDto, TagDto } from '@shared/types';
import { fmtMin, place } from '../lib/format';

export const PX_PER_MIN = 1.6;
export const COL_W = 176;
const GUTTER_W = 48;
const SNAP = 5;
/** Hold this long before a touch drag starts, so the page can still scroll. */
const TOUCH_HOLD_MS = 250;
const RESIZE_HANDLE_PX = 12;

const snap = (m: number): number => Math.round(m / SNAP) * SNAP;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface Lane {
  lane: number;
  lanes: number;
}

/** Greedy lane assignment so overlapping sessions in one room sit side by side. */
function laneLayout(
  items: { session: SessionDto; startMin: number; endMin: number }[],
): Map<number, Lane> {
  const byRoom = new Map<number, typeof items>();
  for (const item of items) {
    const list = byRoom.get(item.session.roomId);
    if (list) list.push(item);
    else byRoom.set(item.session.roomId, [item]);
  }
  const out = new Map<number, Lane>();
  for (const list of byRoom.values()) {
    const sorted = list.slice().sort((a, b) => a.startMin - b.startMin);
    const laneEnds: number[] = [];
    for (const item of sorted) {
      let index = laneEnds.findIndex((end) => end <= item.startMin);
      if (index === -1) {
        laneEnds.push(item.endMin);
        index = laneEnds.length - 1;
      } else {
        laneEnds[index] = item.endMin;
      }
      out.set(item.session.id, { lane: index, lanes: 1 });
    }
    for (const item of sorted) {
      const entry = out.get(item.session.id);
      if (entry) entry.lanes = laneEnds.length;
    }
  }
  return out;
}

interface DragState {
  id: number;
  mode: 'move' | 'resize';
  deltaMin: number;
  deltaRoom: number;
  durMin: number;
}

export interface CalendarProps {
  scrollRef: React.RefObject<HTMLDivElement>;
  rooms: RoomDto[];
  tags: TagDto[];
  sessions: SessionDto[];
  /** Sessions filtered out are dimmed rather than removed (SPEC §7.3). */
  matchedIds: Set<number>;
  timezone: string;
  day: string;
  dayStartMin: number;
  dayEndMin: number;
  nowMin: number | null;
  arrange: boolean;
  canEdit: (session: SessionDto) => boolean;
  onOpen: (id: number) => void;
  onMove: (session: SessionDto, startMin: number, durMin: number, roomId: number) => void;
}

export function Calendar({
  scrollRef,
  rooms,
  tags,
  sessions,
  matchedIds,
  timezone,
  day,
  dayStartMin,
  dayEndMin,
  nowMin,
  arrange,
  canEdit,
  onOpen,
  onMove,
}: CalendarProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const holdTimer = useRef<number | null>(null);

  const placed = useMemo(
    () =>
      sessions
        .map((session) => ({ session, ...place(session, timezone) }))
        .filter((p) => p.date === day),
    [sessions, timezone, day],
  );
  const lanes = useMemo(() => laneLayout(placed), [placed]);
  const tagColor = useMemo(() => new Map(tags.map((t) => [t.id, t.color])), [tags]);

  const height = (dayEndMin - dayStartMin) * PX_PER_MIN;
  const showNow = nowMin !== null && nowMin >= dayStartMin && nowMin <= dayEndMin;

  const startDrag = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement>,
      session: SessionDto,
      startMin: number,
      durMin: number,
      mode: 'move' | 'resize',
    ) => {
      if (!arrange || !canEdit(session)) return;
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startY = event.clientY;
      const isTouch = event.pointerType !== 'mouse';
      let armed = !isTouch;
      let moved = false;
      let deltaMin = 0;
      let deltaRoom = 0;
      let nextDur = durMin;

      const arm = () => {
        armed = true;
        setDrag({ id: session.id, mode, deltaMin: 0, deltaRoom: 0, durMin });
      };
      if (isTouch) holdTimer.current = window.setTimeout(arm, TOUCH_HOLD_MS);
      else arm();

      const onMoveEvent = (ev: PointerEvent) => {
        if (!armed) {
          // Moving before the hold completes means the user meant to scroll.
          if (Math.abs(ev.clientY - startY) > 8 || Math.abs(ev.clientX - startX) > 8) {
            if (holdTimer.current) window.clearTimeout(holdTimer.current);
            cleanup();
          }
          return;
        }
        if (Math.abs(ev.clientY - startY) > 4 || Math.abs(ev.clientX - startX) > 4) moved = true;
        if (mode === 'resize') {
          nextDur = clamp(
            snap(durMin + (ev.clientY - startY) / PX_PER_MIN),
            SNAP,
            dayEndMin - startMin,
          );
          setDrag({ id: session.id, mode, deltaMin: 0, deltaRoom: 0, durMin: nextDur });
        } else {
          deltaMin = snap((ev.clientY - startY) / PX_PER_MIN);
          deltaRoom = Math.round((ev.clientX - startX) / COL_W);
          setDrag({ id: session.id, mode, deltaMin, deltaRoom, durMin });
        }
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onMoveEvent);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', cleanup);
        setDrag(null);
      };

      const onUp = () => {
        if (holdTimer.current) window.clearTimeout(holdTimer.current);
        const wasArmed = armed;
        cleanup();
        if (!wasArmed || !moved) {
          onOpen(session.id);
          return;
        }
        if (mode === 'resize') {
          if (nextDur !== durMin) onMove(session, startMin, nextDur, session.roomId);
          return;
        }
        const newStart = clamp(startMin + deltaMin, dayStartMin, dayEndMin - durMin);
        const roomIndex = clamp(
          rooms.findIndex((r) => r.id === session.roomId) + deltaRoom,
          0,
          rooms.length - 1,
        );
        const roomId = rooms[roomIndex]?.id ?? session.roomId;
        if (newStart !== startMin || roomId !== session.roomId) {
          onMove(session, newStart, durMin, roomId);
        }
      };

      window.addEventListener('pointermove', onMoveEvent);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', cleanup);
    },
    [arrange, canEdit, dayEndMin, dayStartMin, onMove, onOpen, rooms],
  );

  const hourCount = Math.floor((dayEndMin - dayStartMin) / 60) + 1;
  const halfHourCount = Math.ceil((dayEndMin - dayStartMin) / 30);

  return (
    <div
      ref={scrollRef}
      className="overflow-auto border-t border-stone-200 bg-white sm:mt-2 sm:rounded-xl sm:border"
      style={{ maxHeight: 'calc(100vh - 200px)' }}
    >
      <div className="relative" style={{ width: GUTTER_W + rooms.length * COL_W }}>
        <div className="sticky top-0 z-20 flex border-b border-stone-200 bg-white/95 backdrop-blur">
          <div className="shrink-0" style={{ width: GUTTER_W }} />
          {rooms.map((room) => (
            <div
              key={room.id}
              className="border-l border-stone-100 px-3 py-2"
              style={{ width: COL_W }}
            >
              <div className="truncate text-xs font-semibold">{room.name}</div>
              <div className="truncate text-xs text-stone-400">
                {room.capacity ? `${room.capacity} seats` : 'no capacity set'}
                {room.openTrack && (
                  <>
                    {' · '}
                    <span className="font-medium text-emerald-700">open track</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="relative flex" style={{ height }}>
          <div className="sticky left-0 z-10 shrink-0 bg-white" style={{ width: GUTTER_W }}>
            {Array.from({ length: hourCount }, (_, i) => (
              <div
                key={i}
                className="absolute -translate-y-1/2 pr-1 text-right text-xs text-stone-400"
                style={{ top: i * 60 * PX_PER_MIN, width: GUTTER_W - 4 }}
              >
                {fmtMin(dayStartMin + i * 60)}
              </div>
            ))}
          </div>

          {Array.from({ length: halfHourCount }, (_, i) => (
            <div
              key={i}
              className={`pointer-events-none absolute right-0 border-t ${
                i % 2 ? 'border-stone-100' : 'border-stone-200'
              }`}
              style={{ top: i * 30 * PX_PER_MIN, left: GUTTER_W }}
            />
          ))}

          {rooms.map((room, i) => (
            <div
              key={room.id}
              className={`pointer-events-none absolute bottom-0 top-0 border-l border-stone-100 ${
                room.openTrack ? 'bg-emerald-50/40' : ''
              }`}
              style={{ left: GUTTER_W + i * COL_W, width: COL_W }}
            />
          ))}

          {showNow && (
            <div
              className="pointer-events-none absolute left-0 right-0 z-10"
              style={{ top: (nowMin - dayStartMin) * PX_PER_MIN }}
            >
              <div className="h-0.5 w-full bg-accent" />
              <span
                className="absolute -top-2.5 rounded-r bg-stone-900 px-1.5 py-0.5 text-xs font-semibold text-white"
                style={{ left: GUTTER_W }}
              >
                {fmtMin(nowMin)}
              </span>
            </div>
          )}

          {placed.map(({ session, startMin, durMin, endMin }) => {
            const active = drag?.id === session.id ? drag : null;
            const effectiveStart = startMin + (active?.mode === 'move' ? active.deltaMin : 0);
            const effectiveDur = active?.mode === 'resize' ? active.durMin : durMin;
            const roomIndex = clamp(
              rooms.findIndex((r) => r.id === session.roomId) +
                (active?.mode === 'move' ? active.deltaRoom : 0),
              0,
              Math.max(0, rooms.length - 1),
            );
            const lane = lanes.get(session.id) ?? { lane: 0, lanes: 1 };
            const width = (COL_W - 8) / lane.lanes;
            const editable = arrange && canEdit(session);
            const live = nowMin !== null && nowMin >= startMin && nowMin < endMin;
            const dimmed = !matchedIds.has(session.id);

            return (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                aria-label={`${session.title}, ${fmtMin(startMin)} to ${fmtMin(endMin)}`}
                onPointerDown={(e) => startDrag(e, session, startMin, durMin, 'move')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen(session.id);
                  }
                }}
                className={`absolute overflow-hidden rounded-lg border bg-white p-2 text-left shadow-sm transition-shadow
                  ${session.type === 'open' ? 'border-dashed border-emerald-400' : 'border-stone-200'}
                  ${editable ? 'cursor-grab ring-1 ring-stone-300' : 'cursor-pointer hover:shadow'}
                  ${active ? 'z-30 opacity-90 shadow-lg' : ''}
                  ${dimmed ? 'opacity-30' : ''}`}
                style={{
                  top: (effectiveStart - dayStartMin) * PX_PER_MIN,
                  left: GUTTER_W + roomIndex * COL_W + 4 + lane.lane * width,
                  width: width - 2,
                  height: Math.max(effectiveDur * PX_PER_MIN - 3, 22),
                  touchAction: editable ? 'none' : 'auto',
                }}
              >
                <div className="flex gap-1">
                  {session.tagIds.map((id) => (
                    <span
                      key={id}
                      className="mt-0.5 h-1 w-4 rounded-full"
                      style={{ background: tagColor.get(id) ?? '#6B7280' }}
                    />
                  ))}
                  {live && (
                    <span className="ml-auto rounded bg-accent px-1 text-xs font-bold">now</span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs font-semibold leading-tight">
                  {session.title}
                </div>
                <div className="truncate text-xs text-stone-500">
                  {fmtMin(effectiveStart)}–{fmtMin(effectiveStart + effectiveDur)}
                  {session.speaker && ` · ${session.speaker}`}
                </div>
                {session.type === 'open' && (
                  <span className="text-xs font-medium text-emerald-700">open session</span>
                )}
                {editable && (
                  <div
                    role="presentation"
                    onPointerDown={(e) => startDrag(e, session, startMin, durMin, 'resize')}
                    className="absolute inset-x-0 bottom-0 cursor-ns-resize"
                    style={{ height: RESIZE_HANDLE_PX, touchAction: 'none' }}
                  >
                    <div className="mx-auto mb-1 h-0.5 w-6 rounded-full bg-stone-300" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
