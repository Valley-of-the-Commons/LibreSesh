import { useState } from 'react';
import type { Me, Role } from '@shared/types';
import { ApiError, api } from '../lib/api';
import { Field, PrimaryButton, SecondaryButton, inputClass } from './ui';

export interface GateProps {
  slug: string;
  eventName?: string;
  me: Me | null;
  onEntered: () => void;
}

/** Full-screen password gate — an event's schedule is never public (SPEC §3.2). */
export function Gate({ slug, eventName, me, onEntered }: GateProps) {
  const [password, setPassword] = useState('');
  const [name, setName] = useState(me?.displayName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      // The name is claimed as part of entry: it has to be unique inside this
      // event, and the server grants no role if it is taken.
      await api.authenticate(slug, password.trim(), name.trim() || undefined);
      onEntered();
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 429 || err.status === 404 || err.status === 409)
          ? err.message
          : 'That password doesn’t match this event.',
      );
      setBusy(false);
    }
  };

  /** Demo instances hand out roles on a click — there is no password to type. */
  const enterAs = async (role: Role) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.authenticateAsRole(slug, role, name.trim() || undefined);
      onEntered();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const demo = me?.demoMode === true;
  const roles: { role: Role; label: string; blurb: string }[] = [
    { role: 'viewer', label: 'Viewer', blurb: 'Read the schedule, star sessions' },
    { role: 'user', label: 'Attendee', blurb: 'Add notes, propose open sessions' },
    { role: 'admin', label: 'Organiser', blurb: 'Full control of the event' },
  ];

  const initial = (eventName ?? slug).trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 dark:bg-stone-950 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-900 dark:bg-stone-100 dark:text-stone-900 text-sm font-bold text-white">
            {initial}
          </div>
          <h1 className="truncate text-lg font-semibold tracking-tight">{eventName ?? slug}</h1>
        </div>
        {demo ? (
          <>
            <p className="mb-1 mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              Demo instance
            </p>
            <p className="mb-4 text-sm text-stone-500 dark:text-stone-400">
              Pick a role to look around. Nothing here is private.
            </p>
            <div className="flex flex-col gap-2">
              {roles.map((r) => (
                <SecondaryButton
                  key={r.role}
                  className="flex w-full flex-col items-start gap-0.5 py-2.5 text-left"
                  onClick={() => void enterAs(r.role)}
                  disabled={busy}
                >
                  <span className="text-sm font-semibold">{r.label}</span>
                  <span className="text-xs font-normal text-stone-500 dark:text-stone-400">
                    {r.blurb}
                  </span>
                </SecondaryButton>
              ))}
            </div>
            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          </>
        ) : (
          <>
        <p className="mb-5 text-sm text-stone-500 dark:text-stone-400">This schedule needs the event password.</p>

        <Field label="Event password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="••••••••"
            autoFocus
            className={`${inputClass} ${error ? 'border-red-400' : ''}`}
          />
        </Field>
        {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}

        <PrimaryButton className="mt-4 w-full py-2 text-sm" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Checking…' : 'Enter schedule'}
        </PrimaryButton>
          </>
        )}

        <div className="mt-5 border-t border-stone-100 dark:border-stone-800 pt-4">
          <Field label="You'll appear as" hint="Remembered on this device. No account needed.">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className={inputClass}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
