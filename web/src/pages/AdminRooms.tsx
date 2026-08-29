import { useState } from 'react';
import type { RoomDto } from '@shared/types';
import {
  DangerButton,
  Field,
  FormGrid,
  FormRow,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  Section,
  Toggle,
  inputClass,
} from '../components/ui';

export interface AdminRoomsProps {
  rooms: RoomDto[];
  reordering: boolean;
  onCreate: (draft: RoomDraft) => Promise<void>;
  onPatch: (room: RoomDto, patch: Partial<RoomDto>) => Promise<void>;
  onMove: (index: number, direction: -1 | 1) => Promise<void>;
  onDelete: (room: RoomDto) => Promise<void>;
}

export interface RoomDraft {
  name: string;
  capacity: number | null;
  description: string;
  openTrack: boolean;
}

/** '' means "no capacity", which is a real state distinct from 0. */
const parseCapacity = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

const capacityLabel = (capacity: number | null): string =>
  capacity === null ? 'no capacity set' : `${capacity} seat${capacity === 1 ? '' : 's'}`;

/**
 * One venue. Collapsed it is a summary row; expanded it is a real form.
 *
 * The previous version put a borderless input in the row that saved on blur,
 * which gave no hint it was editable and no way to cancel — and left capacity
 * and description with no editor at all, even though the API has always
 * accepted both.
 */
function RoomRow({
  room,
  index,
  total,
  reordering,
  onPatch,
  onMove,
  onDelete,
}: {
  room: RoomDto;
  index: number;
  total: number;
  reordering: boolean;
  onPatch: (room: RoomDto, patch: Partial<RoomDto>) => Promise<void>;
  onMove: (index: number, direction: -1 | 1) => Promise<void>;
  onDelete: (room: RoomDto) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(room.name);
  const [capacity, setCapacity] = useState(room.capacity === null ? '' : String(room.capacity));
  const [description, setDescription] = useState(room.description);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(room.name);
    setCapacity(room.capacity === null ? '' : String(room.capacity));
    setDescription(room.description);
  };

  const dirty =
    name.trim() !== room.name ||
    parseCapacity(capacity) !== room.capacity ||
    description.trim() !== room.description;

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onPatch(room, {
        name: name.trim(),
        capacity: parseCapacity(capacity),
        description: description.trim(),
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="rounded-lg bg-stone-50 dark:bg-stone-800">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="flex shrink-0">
          <IconButton
            onClick={() => void onMove(index, -1)}
            disabled={index === 0 || reordering}
            aria-label={`Move ${room.name} up`}
          >
            ↑
          </IconButton>
          <IconButton
            onClick={() => void onMove(index, 1)}
            disabled={index === total - 1 || reordering}
            aria-label={`Move ${room.name} down`}
          >
            ↓
          </IconButton>
        </div>

        <div className="min-w-32 flex-1">
          <p className="truncate text-sm font-medium">{room.name}</p>
          <p className="truncate text-xs text-stone-500 dark:text-stone-400">
            {capacityLabel(room.capacity)}
            {room.openTrack && ' · attendees may book'}
            {room.description && ` · ${room.description}`}
          </p>
        </div>

        <SecondaryButton
          className="shrink-0 px-3 py-1.5"
          onClick={() => {
            if (open) reset();
            setOpen(!open);
          }}
          aria-expanded={open}
        >
          {open ? 'Close' : 'Edit'}
        </SecondaryButton>
      </div>

      {open && (
        <div className="border-t border-stone-200 px-3 py-3 dark:border-stone-700">
          <FormGrid>
            <Field label="Venue name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className={inputClass}
              />
            </Field>
            <Field label="Capacity" hint="Leave blank if it does not matter.">
              <input
                type="number"
                min={0}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className={inputClass}
              />
            </Field>
          </FormGrid>

          <div className="mt-3">
            <Field label="Description" hint="Shown to attendees. Where it is, how to find it.">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={500}
                className={`${inputClass} resize-none`}
              />
            </Field>
          </div>

          <div className="mt-3">
            <Toggle
              checked={room.openTrack}
              onChange={(next) => void onPatch(room, { openTrack: next })}
              label="Attendees may schedule their own sessions here"
            />
          </div>

          <FormRow className="mt-4">
            <PrimaryButton onClick={() => void save()} disabled={!dirty || !name.trim() || saving}>
              {saving ? 'Saving…' : 'Save venue'}
            </PrimaryButton>
            <SecondaryButton
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Cancel
            </SecondaryButton>
            <DangerButton className="ml-auto" onClick={() => void onDelete(room)}>
              Delete
            </DangerButton>
          </FormRow>
        </div>
      )}
    </li>
  );
}

/** Venues (rooms in the data model) — create, edit, reorder, delete. */
export function AdminRooms({
  rooms,
  reordering,
  onCreate,
  onPatch,
  onMove,
  onDelete,
}: AdminRoomsProps) {
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [openTrack, setOpenTrack] = useState(false);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onCreate({
        name: name.trim(),
        capacity: parseCapacity(capacity),
        description: '',
        openTrack,
      });
      setName('');
      setCapacity('');
      setOpenTrack(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Venues"
      description="The physical spaces sessions happen in. Their order is the order of the schedule's columns."
      className="mb-6"
    >
      <ul className="mb-4 space-y-2">
        {rooms.map((room, index) => (
          <RoomRow
            key={room.id}
            room={room}
            index={index}
            total={rooms.length}
            reordering={reordering}
            onPatch={onPatch}
            onMove={onMove}
            onDelete={onDelete}
          />
        ))}
        {rooms.length === 0 && (
          <li className="text-sm text-stone-400 dark:text-stone-500">No venues yet.</li>
        )}
      </ul>

      <FormRow>
        <div className="min-w-40 flex-1">
          <Field label="New venue">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void add()}
              maxLength={80}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="w-24">
          <Field label="Capacity">
            <input
              type="number"
              min={0}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Toggle
          checked={openTrack}
          onChange={setOpenTrack}
          label="attendees may book"
        />
        <PrimaryButton onClick={() => void add()} disabled={!name.trim() || busy}>
          Add venue
        </PrimaryButton>
      </FormRow>
    </Section>
  );
}
