import { useMemo, useState } from 'react';
import type { PersonDto, RoomDto, Role, SessionDto, TagDto } from '@shared/types';
import type { SessionWrite } from '../lib/api';
import { fmtMin, place } from '../lib/format';
import { zonedTimeToUtc } from '@shared/time';
import {
  Chip,
  Field,
  FormGrid,
  FormStack,
  Modal,
  PrimaryButton,
  SecondaryButton,
  inputClass,
} from './ui';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

export interface SessionModalProps {
  session?: SessionDto;
  rooms: RoomDto[];
  tags: TagDto[];
  people: PersonDto[];
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
  people,
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
  const [speakerId, setSpeakerId] = useState<number | null>(session?.speakerId ?? null);
  // Revealed by the "add someone new" option; a typed name creates a person.
  const [addingSpeaker, setAddingSpeaker] = useState(false);
  const [newSpeaker, setNewSpeaker] = useState('');
  const [description, setDescription] = useState(session?.description ?? '');
  const [livestreamUrl, setLivestreamUrl] = useState(session?.livestreamUrl ?? '');
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
    const stream = livestreamUrl.trim();
    if (stream && !/^https?:\/\//i.test(stream)) {
      setError('A livestream link must start with http:// or https://');
      return;
    }
    const newName = newSpeaker.trim();
    onSave({
      roomId,
      type: isAdmin ? type : undefined,
      title: title.trim(),
      ...(addingSpeaker && newName ? { speakerName: newName } : { speakerId }),
      description: description.trim(),
      livestreamUrl: livestreamUrl.trim(),
      startsAt: zonedTimeToUtc(day, startMin, timezone).toISOString(),
      endsAt: zonedTimeToUtc(day, startMin + durMin, timezone).toISOString(),
      tagIds,
    });
  };

  const heading = session ? 'Edit session' : isAdmin ? 'Add session' : 'Propose an open session';

  return (
    <Modal title={heading} onClose={onCancel}>
      {!isAdmin && (
        <p className="-mt-2 mb-3 text-xs text-stone-500 dark:text-stone-400">
          Open sessions live in open-track rooms and stay editable by you.
        </p>
      )}
      {allowedRooms.length === 0 && (
        <p className="mb-3 rounded-lg bg-stone-50 dark:bg-stone-800 px-3 py-2 text-xs text-stone-600 dark:text-stone-300">
          This event has no open-track rooms yet, so there is nowhere for you to add a session.
        </p>
      )}

      <FormStack>
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
        <select
          value={addingSpeaker ? 'new' : speakerId === null ? '' : String(speakerId)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'new') {
              setAddingSpeaker(true);
              setSpeakerId(null);
            } else {
              setAddingSpeaker(false);
              setSpeakerId(v ? Number(v) : null);
            }
          }}
          className={inputClass}
        >
          <option value="">— none —</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="new">+ Add someone new</option>
        </select>
        {addingSpeaker && (
          <input
            value={newSpeaker}
            onChange={(e) => setNewSpeaker(e.target.value)}
            maxLength={120}
            placeholder="Their name"
            className={`${inputClass} mt-1.5`}
          />
        )}
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

      <Field
        label="Livestream link"
        hint="Optional. Attendees only see this if you set it."
      >
        <input
          value={livestreamUrl}
          onChange={(e) => setLivestreamUrl(e.target.value)}
          placeholder="https://…"
          maxLength={2000}
          className={inputClass}
        />
      </Field>

      <FormGrid>
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
      </FormGrid>

      <Field label="Tags">
        <div className="flex flex-wrap gap-1.5">
          {tags.length === 0 && <span className="text-xs text-stone-400 dark:text-stone-500">No tags yet.</span>}
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
      </FormStack>

      {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-4 flex gap-2">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-red-200 dark:border-red-900 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
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
