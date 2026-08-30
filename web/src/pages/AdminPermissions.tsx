import { useState } from 'react';
import type { Role } from '@shared/types';
import { CAPABILITIES, type Capability, type PermissionMatrix } from '@shared/capabilities';
import { Section, Toggle } from '../components/ui';

const ROLES: Role[] = ['viewer', 'user', 'admin'];

export interface AdminPermissionsProps {
  permissions: Partial<PermissionMatrix>;
  userRoleLabel: string;
  onChange: (next: Partial<PermissionMatrix>) => Promise<void>;
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
}: AdminPermissionsProps) {
  const [busy, setBusy] = useState<string | null>(null);

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
    >
      <div className="overflow-x-auto">
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
                          disabled={role === 'admin' || busy !== null}
                          title={
                            role === 'admin'
                              ? 'Organisers always keep every capability'
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
