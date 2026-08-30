import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PersonDto, Role } from '@shared/types';
import { api } from '../lib/api';
import { RoleBadge, useToast } from './ui';

const itemClass =
  'block w-full px-3 py-2 text-left text-xs font-medium text-stone-700 ' +
  'hover:bg-stone-100 focus-visible:bg-stone-100 focus:outline-none disabled:opacity-40 ' +
  'dark:text-stone-200 dark:hover:bg-stone-800 dark:focus-visible:bg-stone-800';

export interface ProfileMenuProps {
  /** What you go by *in this event* — names are unique per event, so this is
   *  not necessarily `Me.displayName`. */
  displayName: string;
  slug: string;
  role: Role;
  userLabel: string;
  /** The event's roster, used to find the caller's own profile. */
  people: PersonDto[];
  onSignOut: () => void;
}

/**
 * The "you" chip in the header, and the menu behind it (SPEC §7.5). Two
 * destinations only: your profile, and the way out. Your display name is
 * edited on the profile page, and your role follows the event password an
 * organiser issued you — neither belongs on a dropdown, where a stray click
 * could change who you are.
 */
export function ProfileMenu({
  displayName,
  slug,
  role,
  userLabel,
  people,
  onSignOut,
}: ProfileMenuProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // Dismiss on an outside press or Escape. Escape hands focus back to the chip
  // rather than dropping a keyboard user at the top of the document.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Focus the first item on open, so the menu is usable without a mouse.
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const arrowKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const all = Array.from(
      menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const from = all.indexOf(document.activeElement as HTMLElement);
    const to = e.key === 'ArrowDown' ? from + 1 : from - 1;
    all[(to + all.length) % all.length]?.focus();
  };

  /** Jump to your own profile, creating an empty one first if you have none. */
  const openProfile = async () => {
    if (busy) return;
    const mine = people.find((p) => p.isMine);
    if (mine) {
      setOpen(false);
      navigate(`/e/${slug}/p/${mine.id}`);
      return;
    }
    setBusy(true);
    try {
      const created = await api.updateMyProfile(slug, {});
      setOpen(false);
      navigate(`/e/${slug}/p/${created.id}`);
    } catch (err) {
      toast.show((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={wrap}>
      <button
        ref={trigger}
        type="button"
        data-tour="identity"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium hover:border-stone-400 dark:border-stone-600 dark:bg-stone-900 dark:hover:border-stone-500"
      >
        <span className="max-w-24 truncate">{displayName}</span>
        <RoleBadge role={role} userLabel={userLabel} />
      </button>

      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Your account"
          onKeyDown={arrowKeys}
          className="absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-900"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void openProfile()}
            disabled={busy}
            className={itemClass}
          >
            View / edit profile
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className={itemClass}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
