import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PersonDto, RoomDto, TagDto } from '@shared/types';
import { ApiError, api, type TrashDto } from '../lib/api';
import { fmtMin, relativeTime } from '../lib/format';
import { useEventData } from '../lib/useEventData';
import {
  EmptyState,
  Field,
  PrimaryButton,
  SecondaryButton,
  Spinner,
  inputClass,
  useToast,
} from '../components/ui';

const DEFAULT_TAG_COLOR = '#6B7280';

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** Rooms, tags, passwords and event settings — admin only (SPEC §7.1). */
export function AdminPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const data = useEventData(slug);

  const [roomName, setRoomName] = useState('');
  const [roomCapacity, setRoomCapacity] = useState('');
  const [roomOpen, setRoomOpen] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState(DEFAULT_TAG_COLOR);
  const [personName, setPersonName] = useState('');

  const bundle = data.bundle;
  const event = bundle?.event;

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dayStart, setDayStart] = useState('');
  const [dayEnd, setDayEnd] = useState('');
  const [userRoleLabel, setUserRoleLabel] = useState('');
  const [viewerPassword, setViewerPassword] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  // Holds the slug the settings form was filled from. Duplicating an event
  // navigates straight to the new event's admin page, which re-renders this
  // same component instance — so a plain boolean latch would leave the previous
  // event's values in the form.
  const [loadedForSlug, setLoadedForSlug] = useState<string | null>(null);

  const [cloneName, setCloneName] = useState('');
  const [cloneSlug, setCloneSlug] = useState('');
  const [cloneStart, setCloneStart] = useState('');
  const [cloneEnd, setCloneEnd] = useState('');
  const [cloneViewer, setCloneViewer] = useState('');
  const [cloneUser, setCloneUser] = useState('');
  const [cloneAdmin, setCloneAdmin] = useState('');
  const [cloning, setCloning] = useState(false);

  const [trash, setTrash] = useState<TrashDto | null>(null);
  const isAdmin = bundle?.role === 'admin';

  const loadTrash = useCallback(async () => {
    try {
      setTrash(await api.trash(slug));
    } catch (err) {
      toast.show((err as Error).message);
    }
  }, [slug, toast]);

  useEffect(() => {
    if (isAdmin) void loadTrash();
  }, [isAdmin, loadTrash]);

  if (event && loadedForSlug !== event.slug) {
    setLoadedForSlug(event.slug);
    setName(event.name);
    setStartDate(event.startDate);
    setEndDate(event.endDate);
    setDayStart(fmtMin(event.dayStartMin));
    setDayEnd(fmtMin(event.dayEndMin));
    setUserRoleLabel(event.userRoleLabel);
    // Clear the duplicate form too, so it isn't pre-filled after a clone.
    setCloneName('');
    setCloneSlug('');
    setCloneStart('');
    setCloneEnd('');
    setCloneViewer('');
    setCloneUser('');
    setCloneAdmin('');
    setCloning(false);
  }

  const fail = (err: unknown) => toast.show((err as Error).message);

  if (data.status === 'loading') return <Spinner label="Loading…" />;
  if (!bundle || !event) {
    return (
      <EmptyState>
        You need the admin password for this event.{' '}
        <Link to={`/e/${slug}`} className="underline">
          Go to the schedule
        </Link>
      </EmptyState>
    );
  }
  if (bundle.role !== 'admin') {
    return (
      <EmptyState>
        Only organisers can manage this event.{' '}
        <Link to={`/e/${slug}`} className="underline">
          Back to the schedule
        </Link>
      </EmptyState>
    );
  }

  const addRoom = async () => {
    if (!roomName.trim()) return;
    try {
      const created = await api.createRoom(slug, {
        name: roomName.trim(),
        capacity: roomCapacity ? Number(roomCapacity) : null,
        openTrack: roomOpen,
        sortOrder: bundle.rooms.length,
      });
      data.apply({ type: 'room.created', entity: created });
      setRoomName('');
      setRoomCapacity('');
      setRoomOpen(false);
    } catch (err) {
      fail(err);
    }
  };

  const patchRoom = async (room: RoomDto, patch: Partial<RoomDto>) => {
    try {
      data.apply({ type: 'room.updated', entity: await api.updateRoom(slug, room.id, patch) });
    } catch (err) {
      fail(err);
    }
  };

  // Rooms arrive already sorted, so reordering is a matter of array position.
  // Historic rows can share a sort_order (everything seeded before this feature
  // is 0), so swapping the two numbers would be a no-op — instead renumber the
  // whole list and PATCH only the rooms whose number actually moved, which
  // makes the first reorder self-healing.
  const moveRoom = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (reordering || target < 0 || target >= bundle.rooms.length) return;
    const ordered = bundle.rooms.slice();
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setReordering(true);
    try {
      for (let i = 0; i < ordered.length; i += 1) {
        const room = ordered[i];
        if (room.sortOrder === i) continue;
        data.apply({
          type: 'room.updated',
          entity: await api.updateRoom(slug, room.id, { sortOrder: i }),
        });
      }
    } catch (err) {
      fail(err);
    } finally {
      setReordering(false);
    }
  };

  const removeRoom = async (room: RoomDto) => {
    if (!window.confirm(`Delete “${room.name}”?`)) return;
    try {
      await api.deleteRoom(slug, room.id);
      data.apply({ type: 'room.deleted', entity: { id: room.id } });
    } catch (err) {
      fail(err);
    }
  };

  const addTag = async () => {
    if (!tagName.trim()) return;
    try {
      const created = await api.createTag(slug, { name: tagName.trim(), color: tagColor });
      data.apply({ type: 'tag.created', entity: created });
      setTagName('');
      setTagColor(DEFAULT_TAG_COLOR);
    } catch (err) {
      fail(err);
    }
  };

  const patchTag = async (tag: TagDto, patch: Partial<TagDto>) => {
    try {
      data.apply({ type: 'tag.updated', entity: await api.updateTag(slug, tag.id, patch) });
    } catch (err) {
      fail(err);
    }
  };

  const removeTag = async (tag: TagDto) => {
    if (!window.confirm(`Delete the “${tag.name}” tag? It will be removed from every session.`)) {
      return;
    }
    try {
      await api.deleteTag(slug, tag.id);
      data.apply({ type: 'tag.deleted', entity: { id: tag.id } });
    } catch (err) {
      fail(err);
    }
  };

  const addPerson = async () => {
    if (!personName.trim()) return;
    try {
      const created = await api.createPerson(slug, { name: personName.trim() });
      data.apply({ type: 'person.created', entity: created });
      setPersonName('');
    } catch (err) {
      fail(err);
    }
  };

  const removePerson = async (person: PersonDto) => {
    if (
      !window.confirm(
        `Delete ${person.name}? Their sessions keep their slot but lose the speaker.`,
      )
    ) {
      return;
    }
    try {
      await api.deletePerson(slug, person.id);
      data.apply({ type: 'person.deleted', entity: { id: person.id } });
    } catch (err) {
      fail(err);
    }
  };

  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };

  const saveSettings = async () => {
    try {
      const updated = await api.updateSettings(slug, {
        name: name.trim(),
        startDate,
        endDate,
        dayStartMin: toMinutes(dayStart),
        dayEndMin: toMinutes(dayEnd),
        ...(userRoleLabel.trim() ? { userRoleLabel: userRoleLabel.trim() } : {}),
        ...(viewerPassword ? { viewerPassword } : {}),
        ...(userPassword ? { userPassword } : {}),
        ...(adminPassword ? { adminPassword } : {}),
      });
      data.apply({ type: 'event.updated', entity: updated });
      setViewerPassword('');
      setUserPassword('');
      setAdminPassword('');
      toast.show('Settings saved');
    } catch (err) {
      fail(err);
    }
  };

  // The organiser on this page is already the event admin, so no instance key
  // is needed — the endpoint accepts either.
  const cloneSlugValue = cloneSlug || slugify(cloneName);
  const cloneReady =
    cloneName.trim().length > 0 &&
    /^[a-z0-9-]{3,40}$/.test(cloneSlugValue) &&
    cloneStart.length > 0 &&
    cloneEnd.length > 0 &&
    cloneViewer.length >= 6 &&
    cloneUser.length >= 6 &&
    cloneAdmin.length >= 6;

  const cloneEvent = async () => {
    setCloning(true);
    try {
      const created = await api.cloneEvent(slug, {
        newName: cloneName.trim(),
        newSlug: cloneSlugValue,
        startDate: cloneStart,
        endDate: cloneEnd,
        viewerPassword: cloneViewer,
        userPassword: cloneUser,
        adminPassword: cloneAdmin,
      });
      toast.show('Event duplicated — you are its organiser');
      navigate(`/e/${created.slug}/admin`);
    } catch (err) {
      fail(err);
      setCloning(false);
    }
  };

  const setArchived = async (archived: boolean) => {
    if (archived && !window.confirm('Archive this event? It becomes read-only for everyone.')) {
      return;
    }
    try {
      const updated = await api.updateSettings(slug, { archived });
      data.apply({ type: 'event.updated', entity: updated });
      toast.show(archived ? 'Event archived' : 'Event un-archived');
    } catch (err) {
      fail(err);
    }
  };

  const restoreSession = async (id: number) => {
    try {
      data.apply({ type: 'session.created', entity: await api.restoreSession(slug, id) });
      toast.show('Session restored');
      await loadTrash();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'room_missing') {
        toast.show('That session’s room was deleted — recreate the room first, then restore.');
      } else {
        fail(err);
      }
    }
  };

  const restoreContribution = async (id: number) => {
    try {
      data.apply({ type: 'contribution.created', entity: await api.restoreContribution(slug, id) });
      toast.show('Contribution restored');
      await loadTrash();
    } catch (err) {
      fail(err);
    }
  };

  const trashEmpty =
    trash !== null && trash.sessions.length === 0 && trash.contributions.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(`/e/${slug}`)}
          className="text-xs text-stone-500 dark:text-stone-400 underline"
        >
          ← Schedule
        </button>
        <h1 className="text-lg font-semibold tracking-tight">Manage {event.name}</h1>
        <Link
          to={`/e/${slug}/proposals`}
          className="ml-auto text-xs text-stone-500 dark:text-stone-400 underline"
        >
          Proposal pool
        </Link>
      </div>

      <section className="mb-6 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Rooms</h2>
        <ul className="mb-4 space-y-2">
          {bundle.rooms.map((room, index) => (
            <li key={room.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 dark:bg-stone-800 px-3 py-2">
              <div className="flex text-xs text-stone-500 dark:text-stone-400">
                <button
                  type="button"
                  onClick={() => void moveRoom(index, -1)}
                  disabled={index === 0 || reordering}
                  aria-label={`Move ${room.name} up`}
                  className="rounded px-1 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => void moveRoom(index, 1)}
                  disabled={index === bundle.rooms.length - 1 || reordering}
                  aria-label={`Move ${room.name} down`}
                  className="rounded px-1 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  ↓
                </button>
              </div>
              <input
                defaultValue={room.name}
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value !== room.name &&
                  void patchRoom(room, { name: e.target.value.trim() })
                }
                className="min-w-32 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium hover:border-stone-300 focus:border-stone-400 dark:focus:border-stone-500 focus:bg-white dark:focus:bg-stone-900"
              />
              <label className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-300">
                <input
                  type="checkbox"
                  checked={room.openTrack}
                  onChange={(e) => void patchRoom(room, { openTrack: e.target.checked })}
                />
                open track
              </label>
              <span className="text-xs text-stone-400 dark:text-stone-500">
                {room.capacity ? `${room.capacity} seats` : 'no capacity'}
              </span>
              <button
                type="button"
                onClick={() => void removeRoom(room)}
                className="text-xs text-red-500 dark:text-red-400 underline"
              >
                delete
              </button>
            </li>
          ))}
          {bundle.rooms.length === 0 && <li className="text-sm text-stone-400 dark:text-stone-500">No rooms yet.</li>}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <Field label="New room">
              <input value={roomName} onChange={(e) => setRoomName(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <div className="w-24">
            <Field label="Capacity">
              <input
                type="number"
                min={0}
                value={roomCapacity}
                onChange={(e) => setRoomCapacity(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <label className="mb-3 flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-300">
            <input type="checkbox" checked={roomOpen} onChange={(e) => setRoomOpen(e.target.checked)} />
            open track
          </label>
          <PrimaryButton className="mb-3" onClick={() => void addRoom()}>
            Add room
          </PrimaryButton>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Tags</h2>
        <ul className="mb-4 flex flex-wrap gap-2">
          {bundle.tags.map((tag) => (
            <li key={tag.id} className="flex items-center gap-2 rounded-full bg-stone-50 dark:bg-stone-800 py-1 pl-2 pr-3">
              <input
                type="color"
                value={tag.color}
                onChange={(e) => void patchTag(tag, { color: e.target.value })}
                className="h-5 w-5 cursor-pointer rounded border-none bg-transparent p-0"
                aria-label={`Colour for ${tag.name}`}
              />
              <span className="text-xs font-medium">{tag.name}</span>
              <button
                type="button"
                onClick={() => void removeTag(tag)}
                className="text-xs text-red-500 dark:text-red-400"
                aria-label={`Delete ${tag.name}`}
              >
                ✕
              </button>
            </li>
          ))}
          {bundle.tags.length === 0 && <li className="text-sm text-stone-400 dark:text-stone-500">No tags yet.</li>}
        </ul>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="New tag">
              <input value={tagName} onChange={(e) => setTagName(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <input
            type="color"
            value={tagColor}
            onChange={(e) => setTagColor(e.target.value)}
            className="mb-3 h-9 w-12 cursor-pointer rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 p-1"
            aria-label="New tag colour"
          />
          <PrimaryButton className="mb-3" onClick={() => void addTag()}>
            Add tag
          </PrimaryButton>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold">People</h2>
        <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
          Speaker and host profiles. Anyone can claim their own from the schedule.
        </p>
        <ul className="mb-4 space-y-2">
          {bundle.people.map((person) => (
            <li
              key={person.id}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 dark:bg-stone-800 px-3 py-2"
            >
              <span className="min-w-32 flex-1 text-sm font-medium">{person.name}</span>
              {person.claimed && (
                <span className="rounded-full bg-stone-200 dark:bg-stone-700 px-2 py-0.5 text-xs text-stone-600 dark:text-stone-300">
                  claimed
                </span>
              )}
              <Link to={`/e/${slug}/p/${person.id}`} className="text-xs text-stone-500 dark:text-stone-400 underline">
                edit
              </Link>
              <button
                type="button"
                onClick={() => void removePerson(person)}
                className="text-xs text-red-500 dark:text-red-400 underline"
              >
                delete
              </button>
            </li>
          ))}
          {bundle.people.length === 0 && (
            <li className="text-sm text-stone-400 dark:text-stone-500">No people yet.</li>
          )}
        </ul>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="New person">
              <input
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                maxLength={120}
                className={inputClass}
              />
            </Field>
          </div>
          <PrimaryButton className="mb-3" onClick={() => void addPerson()}>
            Add person
          </PrimaryButton>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Event settings</h2>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="End date">
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Day starts">
            <input type="time" step={300} value={dayStart} onChange={(e) => setDayStart(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Day ends">
            <input type="time" step={300} value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field
          label="What you call your participants"
          hint="Shown on role badges and in prompts. “attendee”, “participant”, “member”…"
        >
          <input
            value={userRoleLabel}
            onChange={(e) => setUserRoleLabel(e.target.value)}
            maxLength={24}
            className={inputClass}
          />
        </Field>

        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
          Change passwords
        </p>
        <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">Leave blank to keep the current one.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Viewer">
            <input value={viewerPassword} onChange={(e) => setViewerPassword(e.target.value)} className={inputClass} />
          </Field>
          <Field label={userRoleLabel.trim() || 'User'}>
            <input value={userPassword} onChange={(e) => setUserPassword(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Admin">
            <input value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <PrimaryButton onClick={() => void saveSettings()}>Save settings</PrimaryButton>
      </section>

      <section className="mb-6 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold">Duplicate event</h2>
        <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
          Rooms and tags carry over to the new event; sessions and contributions do not.
        </p>
        <Field label="New name">
          <input value={cloneName} onChange={(e) => setCloneName(e.target.value)} className={inputClass} />
        </Field>
        <Field
          label="New slug"
          hint={`Used in the URL: /e/${cloneSlugValue || 'your-event'}`}
        >
          <input
            value={cloneSlug}
            onChange={(e) => setCloneSlug(slugify(e.target.value))}
            placeholder={slugify(cloneName) || 'your-event'}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input
              type="date"
              value={cloneStart}
              onChange={(e) => {
                setCloneStart(e.target.value);
                if (cloneEnd < e.target.value) setCloneEnd(e.target.value);
              }}
              className={inputClass}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={cloneEnd}
              min={cloneStart}
              onChange={(e) => setCloneEnd(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
          New passwords
        </p>
        <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">At least 6 characters each.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Viewer">
            <input value={cloneViewer} onChange={(e) => setCloneViewer(e.target.value)} className={inputClass} />
          </Field>
          <Field label="User">
            <input value={cloneUser} onChange={(e) => setCloneUser(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Admin">
            <input value={cloneAdmin} onChange={(e) => setCloneAdmin(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <PrimaryButton onClick={() => void cloneEvent()} disabled={!cloneReady || cloning}>
          {cloning ? 'Duplicating…' : 'Duplicate event'}
        </PrimaryButton>
      </section>

      <section className="mb-6 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold">Trash</h2>
        <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
          Deleted sessions and contributions. Restoring puts them back for everyone.
        </p>
        {trash === null ? (
          <p className="text-sm text-stone-400 dark:text-stone-500">Loading…</p>
        ) : trashEmpty ? (
          <p className="text-sm text-stone-400 dark:text-stone-500">Nothing has been deleted.</p>
        ) : (
          <div className="space-y-4">
            {trash.sessions.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
                  Sessions
                </h3>
                <ul className="space-y-2">
                  {trash.sessions.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 dark:bg-stone-800 px-3 py-2"
                    >
                      <span className="min-w-32 flex-1 text-sm font-medium">{s.title}</span>
                      <span className="text-xs text-stone-400 dark:text-stone-500">
                        deleted {relativeTime(s.deletedAt)} · {s.deletedByName}
                      </span>
                      <SecondaryButton className="py-1" onClick={() => void restoreSession(s.id)}>
                        Restore
                      </SecondaryButton>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {trash.contributions.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
                  Contributions
                </h3>
                <ul className="space-y-2">
                  {trash.contributions.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-stone-50 dark:bg-stone-800 px-3 py-2"
                    >
                      <span className="min-w-32 flex-1 truncate text-sm">
                        <span className="text-stone-400 dark:text-stone-500">{c.kind}: </span>
                        {c.body}
                      </span>
                      <span className="text-xs text-stone-400 dark:text-stone-500">
                        deleted {relativeTime(c.deletedAt)} · {c.createdByName}
                      </span>
                      <SecondaryButton
                        className="py-1"
                        onClick={() => void restoreContribution(c.id)}
                      >
                        Restore
                      </SecondaryButton>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold">Archive</h2>
        <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
          An archived event stays readable with the viewer password, but nobody can change anything.
        </p>
        {event.archived ? (
          <SecondaryButton onClick={() => void setArchived(false)}>Un-archive event</SecondaryButton>
        ) : (
          <SecondaryButton onClick={() => void setArchived(true)}>Archive event</SecondaryButton>
        )}
      </section>
    </div>
  );
}
