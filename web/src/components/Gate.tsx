import { useState } from 'react';
import type { Me } from '@shared/types';
import { ApiError, api } from '../lib/api';
import { Field, PrimaryButton, inputClass } from './ui';

export interface GateProps {
  slug: string;
  eventName?: string;
  me: Me | null;
  onMe: (me: Me) => void;
  onEntered: () => void;
}

/** Full-screen password gate — an event's schedule is never public (SPEC §3.2). */
export function Gate({ slug, eventName, me, onMe, onEntered }: GateProps) {
  const [password, setPassword] = useState('');
  const [name, setName] = useState(me?.displayName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const trimmed = name.trim();
      if (trimmed && trimmed !== me?.displayName) {
        onMe(await api.rename(trimmed));
      }
      await api.authenticate(slug, password.trim());
      onEntered();
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 429 || err.status === 404)
          ? err.message
          : 'That password doesn’t match this event.',
      );
      setBusy(false);
    }
  };

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
