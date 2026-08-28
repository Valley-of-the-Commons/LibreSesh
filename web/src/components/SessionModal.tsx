import { useMemo, useState } from 'react';
import type { RoomDto, Role, SessionDto, TagDto } from '@shared/types';
import type { SessionWrite } from '../lib/api';
import { fmtMin, place } from '../lib/format';
import { zonedTimeToUtc } from '@shared/time';
import { Chip, Field, Modal, PrimaryButton, SecondaryButton, inputClass } from './ui';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

export interface SessionModalProps {
  session?: SessionDto;
  rooms: RoomDto[];
  tags: TagDto[];
  role: Role;
  timezone: string;
  days: string[];
  dayLabels: Record<string, string>;
  defaultDay: string;
  dayStartMin: number;
  dayEndMin: number;
  saving: boolean;
  onCancel: () => void;
  onSave: (body: SessionWrite) => void;
  onDelete?: () => void;
}

export function SessionModal({
  session,
  rooms,
  tags,
  role,
  timezone,
  days,
  dayLabels,
  defaultDay,
  dayStartMin,
  dayEndMin,
  saving,
  onCancel,
  onSave,
  onDelete,
}: SessionModalProps) {
  const isAdmin = role === 'admin';
  // Users may only place sessions in open-track rooms (SPEC §5.1).
  const allowedRooms = useMemo(
    () => (isAdmin ? rooms : rooms.filter((r) => r.openTrack)),
    [isAdmin, rooms],
  );

  const existing = session ? place(session, timezone) : null;
  const [title, setTitle] = useState(session?.title ?? '');
  const [speaker, setSpeaker] = useState(session?.speaker ?? '');
  const [description, setDescription] = useState(session?.description ?? '');
  const [roomId, setRoomId] = useState<number>(session?.roomId ?? allowedRooms[0]?.id ?? 0);
  const [day, setDay] = useState(existing?.date ?? defaultDay);
  const [start, setStart] = useState(fmtMin(existing?.startMin ?? Math.max(dayStartMin, 14 * 60)));
  const [durMin, setDurMin] = useState(existing?.durMin ?? 30);
  const [tagIds, setTagIds] = useState<number[]>(session?.tagIds ?? []);
  const [type, setType] = useState<'official' | 'open'>(
    session?.type ?? (isAdmin ? 'official' : 'open'),
  );
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!title.trim()) {
      setError('A title is required');
      return;
    }
    if (!roomId) {
      setError('There is no room you can place this in');
      return;
    }
    const [h, m] = start.split(':').map(Number);
    const startMin = Math.round(((h ?? 0) * 60 + (m ?? 0)) / 5) * 5;
    if (!isAdmin && (startMin < dayStartMin || startMin + durMin > dayEndMin)) {
      setError(`Open sessions must sit between ${fmtMin(dayStartMin)} and ${fmtMin(dayEndMin)}`);
      return;
    }
    onSave({
      roomId,
      type: isAdmin ? type : undefined,
      title: title.trim(),
      speaker: speaker.trim(),
      description: description.trim(),
      startsAt: zonedTimeToUtc(day, startMin, timezone).toISOString(),
      endsAt: zonedTimeToUtc(day, startMin + durMin, timezone).toISOString(),
      tagIds,
    });
  };

  const heading = session ? 'Edit session' : isAdmin ? 'Add session' : 'Propose an open session';

  return (
    <Modal title={heading} onClose={onCancel}>
      {!isAdmin && (
        <p className="-mt-2 mb-3 text-xs text-stone-500">
          Open sessions live in open-track rooms and stay editable by you.
        </p>
      )}
      {allowedRooms.length === 0 && (
        <p className="mb-3 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
          This event has no open-track rooms yet, so there is nowhere for you to add a session.
        </p>
      )}

      <Field label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className={inputClass}
          autoFocus
        />
      </Field>
      <Field label="Speaker / host">
        <input
          value={speaker}
          onChange={(e) => setSpeaker(e.target.value)}
          maxLength={120}
          className={inputClass}
        />
      </Field>
      <Field label="Description" hint="Markdown is supported.">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={5000}
          className={`${inputClass} resize-none`}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Room">
          <select
            value={roomId}
            onChange={(e) => setRoomId(Number(e.target.value))}
            className={inputClass}
          >
            {allowedRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.openTrack ? ' (open)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Day">
          <select value={day} onChange={(e) => setDay(e.target.value)} className={inputClass}>
            {days.map((d) => (
              <option key={d} value={d}>
                {dayLabels[d] ?? d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start (5-min steps)">
          <input
            type="time"
            step={300}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Duration">
          <select
            value={durMin}
            onChange={(e) => setDurMin(Number(e.target.value))}
            className={inputClass}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Tags">
        <div className="flex flex-wrap gap-1.5">
          {tags.length === 0 && <span className="text-xs text-stone-400">No tags yet.</span>}
          {tags.map((t) => (
            <Chip
              key={t.id}
              dot={t.color}
              active={tagIds.includes(t.id)}
              onClick={() =>
                setTagIds((prev) =>
                  prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                )
              }
            >
              {t.name}
            </Chip>
          ))}
        </div>
      </Field>

      {isAdmin && (
        <Field label="Type">
          <div className="flex gap-1.5">
            {(['official', 'open'] as const).map((t) => (
              <Chip key={t} active={type === t} onClick={() => setType(t)}>
                {t}
              </Chip>
            ))}
          </div>
        </Field>
      )}

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        )}
        <SecondaryButton className="ml-auto" onClick={onCancel}>
          Cancel
        </SecondaryButton>
        <PrimaryButton onClick={save} disabled={saving || allowedRooms.length === 0}>
          {saving ? 'Saving…' : 'Save'}
        </PrimaryButton>
      </div>
    </Modal>
  );
}
