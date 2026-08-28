import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Field, PrimaryButton, inputClass } from '../components/ui';
import { useToast } from '../components/ui';

const browserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Creating an event needs the instance password (SPEC §3.3). */
export function NewEventPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [instanceKey, setInstanceKey] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState(browserTimezone());
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [viewerPassword, setViewerPassword] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const slugify = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createEvent(instanceKey, {
        name: name.trim(),
        slug: slug || slugify(name),
        timezone,
        startDate,
        endDate,
        viewerPassword,
        userPassword,
        adminPassword,
      });
      toast.show('Event created — you are its admin');
      navigate(`/e/${created.slug}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Link to="/" className="text-xs text-stone-500 underline">
        ← All events
      </Link>
      <h1 className="mb-1 mt-3 text-lg font-semibold tracking-tight">Create an event</h1>
      <p className="mb-5 text-sm text-stone-500">
        You’ll need the instance password. The three event passwords are what attendees use.
      </p>

      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <Field label="Instance password">
          <input
            type="password"
            value={instanceKey}
            onChange={(e) => setInstanceKey(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Event name">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug) setSlug('');
            }}
            maxLength={120}
            className={inputClass}
          />
        </Field>
        <Field label="Slug" hint={`Used in the URL: /e/${slug || slugify(name) || 'your-event'}`}>
          <input
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            placeholder={slugify(name) || 'your-event'}
            className={inputClass}
          />
        </Field>
        <Field label="Timezone" hint="IANA name, e.g. Europe/Berlin.">
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
              className={inputClass}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-stone-400">
          Event passwords
        </p>
        <Field label="Viewer — read the schedule">
          <input
            value={viewerPassword}
            onChange={(e) => setViewerPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="User — add contributions and open sessions">
          <input
            value={userPassword}
            onChange={(e) => setUserPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Admin — full control">
          <input
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            className={inputClass}
          />
        </Field>

        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        <PrimaryButton className="w-full py-2 text-sm" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Creating…' : 'Create event'}
        </PrimaryButton>
      </div>
    </div>
  );
}
