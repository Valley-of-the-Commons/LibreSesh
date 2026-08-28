import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EventSummary } from '@shared/types';
import { api } from '../lib/api';
import { ThemeToggle } from '../components/ThemeToggle';
import { EmptyState, Spinner } from '../components/ui';

const fmtRange = (start: string, end: string): string => {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
  const from = new Date(`${start}T12:00:00Z`).toLocaleDateString(undefined, opts);
  if (start === end) return from;
  const to = new Date(`${end}T12:00:00Z`).toLocaleDateString(undefined, {
    ...opts,
    year: 'numeric',
  });
  return `${from} – ${to}`;
};

export function EventListPage() {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listEvents()
      .then(setEvents)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-stone-900 dark:bg-stone-100 dark:text-stone-900 text-sm font-bold text-white">
          L
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">LibreSesh</h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">Live schedules for conferences and unconferences.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link
            to="/new"
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:border-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-400"
          >
            New event
          </Link>
        </div>
      </header>

      {error && <EmptyState>{error}</EmptyState>}
      {!events && !error && <Spinner label="Loading events…" />}
      {events?.length === 0 && (
        <EmptyState>
          No events yet.{' '}
          <Link to="/new" className="underline">
            Create the first one
          </Link>
          .
        </EmptyState>
      )}

      <ul className="space-y-2">
        {events?.map((event) => (
          <li key={event.slug}>
            <Link
              to={`/e/${event.slug}`}
              className="flex items-center gap-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-4 shadow-sm hover:shadow"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{event.name}</div>
                <div className="text-xs text-stone-500 dark:text-stone-400">
                  {fmtRange(event.startDate, event.endDate)}
                  {event.archived && ' · archived'}
                </div>
              </div>
              <span className="text-xs font-medium text-stone-400 dark:text-stone-500">Enter →</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs text-stone-400 dark:text-stone-500">
        Every event is password-protected — you’ll be asked for one when you enter.
      </p>
    </div>
  );
}
