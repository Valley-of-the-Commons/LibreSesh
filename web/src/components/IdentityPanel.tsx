import { useState } from 'react';
import type { Me, Role } from '@shared/types';
import { ApiError, api } from '../lib/api';
import { Field, Modal, PrimaryButton, RoleBadge, SecondaryButton, inputClass } from './ui';

export interface IdentityPanelProps {
  me: Me | null;
  slug: string;
  role: Role;
  onMe: (me: Me) => void;
  onRoleChange: (role: Role) => void;
  onSignOut: () => void;
  onClose: () => void;
}

/** Rename, change role by password, or leave the event (SPEC §7.5). */
export function IdentityPanel({
  me,
  slug,
  role,
  onMe,
  onRoleChange,
  onSignOut,
  onClose,
}: IdentityPanelProps) {
  const [name, setName] = useState(me?.displayName ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === me?.displayName) return;
    try {
      onMe(await api.rename(trimmed));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const applyPassword = async () => {
    if (!password.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { role: next } = await api.authenticate(slug, password.trim());
      setPassword('');
      onRoleChange(next);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? err.message
          : 'No role matches that password.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Your identity" onClose={onClose}>
      <div className="-mt-2 mb-4 flex items-center justify-between">
        <span className="text-xs text-stone-500">Role for this event</span>
        <RoleBadge role={role} />
      </div>

      <Field label="Display name" hint="Saved on this device. No account needed.">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(e) => e.key === 'Enter' && void saveName()}
            maxLength={40}
            className={inputClass}
          />
          <PrimaryButton className="shrink-0" onClick={() => void saveName()}>
            Save
          </PrimaryButton>
        </div>
      </Field>

      <Field label="Change role — enter another event password">
        <div className="flex gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void applyPassword()}
            placeholder="••••••••"
            className={`${inputClass} ${error ? 'border-red-400' : ''}`}
          />
          <PrimaryButton className="shrink-0" onClick={() => void applyPassword()} disabled={busy}>
            Apply
          </PrimaryButton>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </Field>

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onSignOut}
          className="text-xs font-medium text-stone-500 underline hover:text-stone-800"
        >
          Sign out of event
        </button>
        <SecondaryButton onClick={onClose}>Done</SecondaryButton>
      </div>
    </Modal>
  );
}
