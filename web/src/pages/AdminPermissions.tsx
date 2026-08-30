import { useState } from 'react';
import type { Role } from '@shared/types';
import { CAPABILITIES, type Capability, type PermissionMatrix } from '@shared/capabilities';
import {
  Field,
  PrimaryButton,
  SecondaryButton,
  Section,
  Toggle,
  inputClass,
} from '../components/ui';

const ROLES: Role[] = ['viewer', 'user', 'admin'];

export interface AdminPermissionsProps {
  permissions: Partial<PermissionMatrix>;
  userRoleLabel: string;
  onChange: (next: Partial<PermissionMatrix>) => Promise<void>;
  /** Resolves true when the organiser password was right. */
  onUnlock: (password: string) => Promise<boolean>;
}

/**
 * Who may do what, per event. The admin column is rendered but locked on:
 * switching admin off for, say, moderation would produce an event nobody can
 * moderate and nobody can repair. Viewer and attendee are where the actual
 * policy decisions live.
 */
export function AdminPermissions({
  permissions,
  userRoleLabel,
  onChange,
  onUnlock,
}: AdminPermissionsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  // Each toggle saves the instant it is clicked and there is no undo, so the
  // matrix opens read-only. Nothing here is reversible by a second glance:
  // switching moderation off for organisers-but-one is invisible until someone
  // needs it.
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);

  const unlock = async () => {
    if (!password.trim() || checking) return;
    setChecking(true);
    try {
      if (await onUnlock(password.trim())) {
        setUnlocked(true);
        setPassword('');
      }
    } finally {
      setChecking(false);
    }
  };

  const heading = (role: Role) =>
    role === 'user' ? (userRoleLabel.trim() || 'Attendee') : role === 'admin' ? 'Organiser' : 'Viewer';

  const toggle = async (capability: Capability, role: Role, next: boolean) => {
    if (busy) return;
    const current = permissions[capability] ?? [];
    const updated = next ? [...current, role] : current.filter((r) => r !== role);
    setBusy(`${capability}:${role}`);
    try {
      await onChange({ [capability]: ROLES.filter((r) => updated.includes(r)) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      title="Permissions"
      description="What each role may do at this event. Organisers always keep every capability — an event nobody can moderate has no way back."
      className="mb-6"
      actions={
        unlocked ? (
          <SecondaryButton className="shrink-0 py-1.5" onClick={() => setUnlocked(false)}>
            Lock
          </SecondaryButton>
        ) : undefined
      }
    >
      {!unlocked && (
        <div className="mb-4 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1">
              <Field
                label="Unlock with the organiser password"
                hint="Every switch here saves the moment you click it, and there is no undo."
              >
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void unlock()}
                  autoComplete="off"
                  className={inputClass}
                />
              </Field>
            </div>
            <PrimaryButton onClick={() => void unlock()} disabled={!password.trim() || checking}>
              {checking ? 'Checking…' : 'Unlock'}
            </PrimaryButton>
          </div>
        </div>
      )}

      <div
        className={`overflow-x-auto ${unlocked ? '' : 'select-none opacity-50'}`}
        aria-disabled={!unlocked}
      >
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-700">
              <th className="py-2 pr-3 text-left text-xs font-semibold text-stone-500 dark:text-stone-400">
                Capability
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  className="w-20 py-2 text-center text-xs font-semibold capitalize text-stone-500 dark:text-stone-400"
                >
                  {heading(role)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((cap) => {
              const allowed = permissions[cap.id] ?? [];
              return (
                <tr
                  key={cap.id}
                  className="border-b border-stone-100 last:border-0 dark:border-stone-800"
                >
                  <td className="py-2 pr-3 text-stone-700 dark:text-stone-300">{cap.label}</td>
                  {ROLES.map((role) => (
                    <td key={role} className="py-2 text-center">
                      <span className="inline-flex justify-center">
                        <Toggle
                          checked={role === 'admin' || allowed.includes(role)}
                          disabled={!unlocked || role === 'admin' || busy !== null}
                          title={
                            role === 'admin'
                              ? 'Organisers always keep every capability'
                              : !unlocked
                                ? 'Unlock with the organiser password to change this'
                                : undefined
                          }
                          onChange={(next) => void toggle(cap.id, role, next)}
                          label={<span className="sr-only">{`${heading(role)}: ${cap.label}`}</span>}
                        />
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
