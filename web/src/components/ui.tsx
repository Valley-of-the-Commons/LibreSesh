import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Role } from '@shared/types';

export const inputClass =
  'w-full rounded-lg border border-stone-300 bg-white dark:bg-stone-900 px-3 py-2 text-sm outline-none ' +
  'focus:border-stone-500 dark:border-stone-600 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-stone-400';

/**
 * A labelled control. Deliberately carries **no** outer margin: spacing is the
 * parent's job via `FormStack`/`FormRow`/`FormGrid`. An earlier version owned a
 * `mb-3`, which forced every adjacent button to hardcode a matching `mb-3` to
 * line up — and that broke the moment a field grew a `hint` and got taller.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-300"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">{hint}</p>}
    </div>
  );
}

/** Vertically stacked form controls, evenly spaced. */
export function FormStack({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-3 ${className}`}>{children}</div>;
}

/**
 * Controls on one line, bottom-aligned so inputs and buttons share a baseline
 * regardless of label or hint height. This is what replaces the `mb-3` hack.
 */
export function FormRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-end gap-2 ${className}`}>{children}</div>;
}

/**
 * Responsive grid of fields. `items-start`, not `items-end`: every child is a
 * `Field`, whose label is one line, so aligning the tops aligns the inputs and
 * lets a hint hang below its own field. Bottom-aligning instead lifted the
 * input of any field *without* a hint by the height of its neighbour's — which
 * is what knocked the room editor's Name and Capacity out of line.
 */
export function FormGrid({
  children,
  cols = 2,
  className = '',
}: {
  children: ReactNode;
  cols?: 2 | 3;
  className?: string;
}) {
  const at = cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';
  return <div className={`grid items-start gap-3 ${at} ${className}`}>{children}</div>;
}

/** `userLabel` is the event's own word for the middle role, e.g. "attendee". */
export function RoleBadge({ role, userLabel }: { role: Role; userLabel?: string }) {
  const style = {
    admin: 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900',
    speaker: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300',
    user: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    viewer: 'bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300',
  }[role];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${style}`}>
      {role === 'user' ? (userLabel ?? 'attendee') : role}
    </span>
  );
}

export function Chip({
  active,
  onClick,
  children,
  dot,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  dot?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        active
          ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
          : 'border-stone-300 bg-white text-stone-600 hover:border-stone-400 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-500'
      }`}
    >
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
      {children}
    </button>
  );
}

export function PrimaryButton({
  children,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded-lg border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:border-stone-500 disabled:opacity-40 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-stone-400 ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Destructive action. Previously these were red *underlined text links*, which
 * read as navigation rather than as a button and gave no hit target.
 */
export function DangerButton({
  children,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded-lg border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-600 hover:border-red-500 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:bg-stone-900 dark:text-red-400 dark:hover:border-red-700 dark:hover:bg-red-950/40 ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * A round "?" that reveals a note beside the control it explains. For the
 * handful of fields whose meaning is not in their name — where a hint under
 * the field would be permanent clutter for something you read once.
 */
export function HelpButton({
  open,
  onClick,
  label,
}: {
  open: boolean;
  onClick: () => void;
  /** Names what is being explained, e.g. "session types". */
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={`Explain ${label}`}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold leading-none ${
        open
          ? 'border-stone-500 bg-stone-500 text-white dark:border-stone-400 dark:bg-stone-400 dark:text-stone-900'
          : 'border-stone-300 text-stone-500 hover:border-stone-500 hover:text-stone-700 dark:border-stone-600 dark:text-stone-400 dark:hover:border-stone-400 dark:hover:text-stone-200'
      }`}
    >
      ?
    </button>
  );
}

/** Square button for a single glyph — reorder arrows, close, etc. Always needs
 *  an `aria-label`, since the glyph is not a name. */
export function IconButton({
  children,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-sm text-stone-500 hover:border-stone-300 hover:bg-stone-100 disabled:opacity-30 disabled:hover:border-transparent disabled:hover:bg-transparent dark:text-stone-400 dark:hover:border-stone-600 dark:hover:bg-stone-800 ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Inline navigation. Underline appears on hover/focus rather than at rest —
 * permanently underlined links made dense admin screens look noisy, and were
 * being used for actions (delete) that are not navigation at all.
 */
export function TextLink({
  children,
  className = '',
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...rest}
      className={`rounded text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline focus-visible:underline dark:text-stone-400 dark:hover:text-stone-100 ${className}`}
    >
      {children}
    </a>
  );
}

/** The class `TextLink` applies, for react-router `<Link>`, which needs to own
 *  its own element. Keeps one definition of what a link looks like. */
export const linkClass =
  'rounded text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline ' +
  'focus-visible:underline dark:text-stone-400 dark:hover:text-stone-100';

/** A titled card. Replaces the `rounded-2xl border … p-5 shadow-sm` string that
 *  was repeated at every section on the admin page. */
export function Section({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900 ${className}`}
    >
      <div
        className={`flex flex-wrap items-start gap-3 ${children ? 'mb-3' : ''}`}
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && (
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{description}</p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Checkbox with its label as one hit target, aligned to the same baseline as
 *  the inputs beside it. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  title,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label
      title={title}
      className={`flex items-center gap-1.5 text-xs ${
        disabled
          ? 'cursor-not-allowed text-stone-400 dark:text-stone-600'
          : 'cursor-pointer text-stone-600 dark:text-stone-300'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-stone-900 disabled:opacity-50 dark:accent-stone-100"
      />
      {label}
    </label>
  );
}

/** Bottom sheet on mobile, centred dialog from `sm` up. Closes on backdrop
 *  click and Escape; focus moves in on open. */
export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    // The overlay scrolls, not just the panel. Centring an overflowing child
    // with `items-center` puts its top above the container's top edge, where
    // no scrolling can reach it — the modal appears cut off at the top. A
    // scrollable overlay wrapping a `min-h-full` flex row keeps the whole
    // panel reachable however tall it gets.
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Fixed, not absolute: the backdrop must cover the viewport while the
          overlay behind it scrolls. */}
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 cursor-default bg-stone-900/40 dark:bg-black/60"
        onClick={onClose}
      />
      <div className="flex min-h-full items-end justify-center sm:items-center sm:p-4">
        <div
          ref={panel}
          tabIndex={-1}
          // dvh, not vh: on mobile browsers vh counts the area behind the
          // address bar, so 90vh can be taller than what you can actually see.
          className={`relative max-h-[100dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 outline-none dark:bg-stone-900 sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl ${
            wide ? 'max-w-2xl' : 'max-w-md'
          }`}
        >
          <h2 className="mb-4 text-base font-semibold tracking-tight">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Toasts ------------------------------- */

interface ToastApi {
  show: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

export const useToast = (): ToastApi => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  const show = useCallback((text: string) => setMessage(text), []);
  const value = useMemo(() => ({ show }), [show]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 2800);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-[60] max-w-[90vw] -translate-x-1/2 rounded-lg bg-stone-900 px-4 py-2 text-center text-xs font-medium text-white shadow-lg dark:bg-stone-100 dark:text-stone-900"
        >
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">{children}</div>;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="py-20 text-center text-sm text-stone-400 dark:text-stone-500" role="status">
      {label}
    </div>
  );
}
