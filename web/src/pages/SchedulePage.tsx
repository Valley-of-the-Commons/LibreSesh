import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  ContributionDto,
  ContributionKind,
  SessionDto,
} from "@shared/types";
import { dateRange, zonedTimeToUtc } from "@shared/time";
import { ApiError, api, type SessionWrite } from "../lib/api";
import {
  dayLabel,
  fmtMin,
  nowMinuteOfDay,
  place,
  todayInZone,
} from "../lib/format";
import { useEventData } from "../lib/useEventData";
import { useFilters } from "../lib/useFilters";
import { useMe } from "../lib/useMe";
import { Calendar, PX_PER_MIN, timeClashPairs } from "../components/Calendar";
import { DetailSheet } from "../components/DetailSheet";
import { Gate } from "../components/Gate";
import { ListView } from "../components/ListView";
import { Logo } from "../components/Logo";
import { ProfileMenu } from "../components/ProfileMenu";
import { SessionModal } from "../components/SessionModal";
import { ThemeToggle } from "../components/ThemeToggle";
import { Tour, tourSeen, type TourStep } from "../components/Tour";
import {
  Chip,
  EmptyState,
  Modal,
  PrimaryButton,
  SecondaryButton,
  Spinner,
  inputClass,
  useToast,
} from "../components/ui";

const NOW_TICK_MS = 30_000;

export function SchedulePage() {
  const { slug = "", sessionId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { me } = useMe();
  const data = useEventData(slug);
  const filters = useFilters();

  const [tourOpen, setTourOpen] = useState(false);
  const [arrange, setArrange] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [clashDismissed, setClashDismissed] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ session?: SessionDto } | null>(null);
  const [saving, setSaving] = useState(false);
  // The wall clock is state, not a counter, so everything derived from "now"
  // has a real dependency to recompute against.
  const [clock, setClock] = useState(() => Date.now());
  const calRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), NOW_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const closeTour = useCallback(() => setTourOpen(false), []);

  // First visit to this event auto-starts the tour, once the schedule has
  // painted and storage doesn't already say it's been seen.
  useEffect(() => {
    if (data.status !== "ready" || tourSeen(slug)) return;
    const raf = requestAnimationFrame(() => {
      if (document.querySelector("[data-tour]")) setTourOpen(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [data.status, slug]);

  const bundle = data.bundle;
  const event = bundle?.event;
  const timezone = event?.timezone ?? "UTC";

  const days = useMemo(
    () => (event ? dateRange(event.startDate, event.endDate) : []),
    [event],
  );
  const today = useMemo(
    () => (event ? todayInZone(timezone, new Date(clock)) : ""),
    [event, timezone, clock],
  );
  const day =
    filters.day && days.includes(filters.day)
      ? filters.day
      : days.includes(today)
        ? today
        : (days[0] ?? "");
  const isToday = day === today;
  const nowMin = useMemo(
    () => (event && isToday ? nowMinuteOfDay(timezone, new Date(clock)) : null),
    [event, isToday, timezone, clock],
  );

  const view =
    filters.view ??
    (typeof window !== "undefined" && window.innerWidth < 640 ? "list" : "cal");

  const dayLabels = useMemo(
    () =>
      Object.fromEntries(
        days.map((d) => {
          const label = dayLabel(d, today);
          return [d, `${label.top} ${label.sub}`];
        }),
      ),
    [days, today],
  );

  /** The identity's starred session ids, as a set for cheap lookups. */
  const starredIds = useMemo(
    () => new Set(bundle?.starredSessionIds ?? []),
    [bundle?.starredSessionIds],
  );

  /** Sessions on the current day that pass the filter chips (SPEC §7.3). */
  const matchedIds = useMemo(() => {
    if (!bundle) return new Set<number>();
    const q = filters.q.trim().toLowerCase();
    const soonNow = nowMin;
    return new Set(
      bundle.sessions
        .filter((s) => {
          if (filters.rooms.length && !filters.rooms.includes(s.roomId))
            return false;
          if (
            filters.tags.length &&
            !s.tagIds.some((t) => filters.tags.includes(t))
          )
            return false;
          if (filters.mine && !starredIds.has(s.id)) return false;
          if (
            q &&
            !`${s.title} ${s.speaker} ${s.description}`
              .toLowerCase()
              .includes(q)
          ) {
            return false;
          }
          if (filters.soon) {
            if (soonNow === null) return false;
            const { endMin } = place(s, timezone);
            if (endMin <= soonNow) return false;
          }
          return true;
        })
        .map((s) => s.id),
    );
  }, [
    bundle,
    filters.rooms,
    filters.tags,
    filters.q,
    filters.soon,
    filters.mine,
    starredIds,
    nowMin,
    timezone,
  ]);

  const daySessions = useMemo(
    () =>
      bundle
        ? bundle.sessions.filter((s) => place(s, timezone).date === day)
        : [],
    [bundle, timezone, day],
  );
  const visibleSessions = useMemo(
    () => daySessions.filter((s) => matchedIds.has(s.id)),
    [daySessions, matchedIds],
  );

  /** Text-search hits that fall on a day other than the one on screen. Room,
   *  tag and "soon" scoping is unchanged — only a free-text query reaches
   *  across days, because that is the case that looks broken otherwise. */
  const otherDayMatches = useMemo(() => {
    if (!bundle || !filters.q.trim()) return [];
    return bundle.sessions
      .filter((s) => matchedIds.has(s.id) && place(s, timezone).date !== day)
      .map((s) => ({ session: s, ...place(s, timezone) }))
      .sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : a.startMin - b.startMin,
      );
  }, [bundle, filters.q, matchedIds, timezone, day]);

  /** Starred pairs that overlap in time (any room) — you cannot attend both. */
  const clashPairs = useMemo(() => {
    if (!bundle) return [] as [SessionDto, SessionDto][];
    const placed = bundle.sessions
      .filter((s) => starredIds.has(s.id))
      .map((s) => ({ session: s, ...place(s, timezone) }));
    return timeClashPairs(placed);
  }, [bundle, starredIds, timezone]);
  const clashIds = useMemo(
    () => new Set(clashPairs.flatMap(([a, b]) => [a.id, b.id])),
    [clashPairs],
  );
  // Dismissal is keyed to the clashing set, so starring into a fresh clash
  // brings the warning back.
  const clashKey = clashPairs.map(([a, b]) => `${a.id}-${b.id}`).join(",");
  const showClashBanner = clashKey !== "" && clashDismissed !== clashKey;

  /** Jump to a search result on another day: switch day and open it in one nav. */
  const openResult = useCallback(
    (session: SessionDto) => {
      const params = new URLSearchParams(window.location.search);
      params.set("day", place(session, timezone).date);
      navigate(`/e/${slug}/s/${session.id}?${params.toString()}`);
    },
    [navigate, slug, timezone],
  );

  const openSession = useCallback(
    (id: number) => navigate(`/e/${slug}/s/${id}${window.location.search}`),
    [navigate, slug],
  );
  const closeSession = useCallback(
    () => navigate(`/e/${slug}${window.location.search}`),
    [navigate, slug],
  );

  const selected = sessionId
    ? bundle?.sessions.find((s) => s.id === Number(sessionId))
    : undefined;

  const { loadContributions } = data;
  useEffect(() => {
    if (selected) void loadContributions(selected.id);
  }, [selected?.id, loadContributions, selected]);

  const canEdit = useCallback(
    (session: SessionDto) =>
      bundle?.role === "admin" ||
      (bundle?.role === "user" &&
        session.type === "open" &&
        session.createdBy === me?.id),
    [bundle?.role, me?.id],
  );

  const reportError = useCallback(
    (err: unknown) => {
      const message =
        err instanceof ApiError
          ? err.message
          : ((err as Error)?.message ?? "Something went wrong");
      toast.show(message);
    },
    [toast],
  );

  /** Optimistic star toggle; stars are private so there is no SSE echo to wait
   *  for. Revert and toast if the server rejects it. */
  const toggleStar = useCallback(
    async (session: SessionDto) => {
      const wasStarred =
        bundle?.starredSessionIds.includes(session.id) ?? false;
      data.setStarred(session.id, !wasStarred);
      try {
        if (wasStarred) await api.unstarSession(slug, session.id);
        else await api.starSession(slug, session.id);
      } catch (err) {
        data.setStarred(session.id, wasStarred);
        reportError(err);
      }
    },
    [bundle, data, reportError, slug],
  );

  const jumpToNow = useCallback(() => {
    if (today && days.includes(today)) filters.set({ day: today });
    requestAnimationFrame(() => {
      const minute = nowMinuteOfDay(timezone);
      const el = calRef.current;
      if (el && event) {
        el.scrollTo({
          top: (minute - event.dayStartMin) * PX_PER_MIN - el.clientHeight / 2,
          behavior: "smooth",
        });
      }
      document
        .getElementById("now-anchor")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [days, event, filters, timezone, today]);

  /** PATCH on drop; a rejected move snaps back because we never mutated locally. */
  const moveSession = useCallback(
    async (
      session: SessionDto,
      startMin: number,
      durMin: number,
      roomId: number,
    ) => {
      if (!event) return;
      const date = place(session, timezone).date;
      try {
        const updated = await api.updateSession(slug, session.id, {
          roomId,
          startsAt: zonedTimeToUtc(date, startMin, timezone).toISOString(),
          endsAt: zonedTimeToUtc(
            date,
            startMin + durMin,
            timezone,
          ).toISOString(),
          expectedUpdatedAt: session.updatedAt,
        });
        data.apply({ type: "session.updated", entity: updated });
        toast.show(`Moved to ${fmtMin(startMin)}`);
      } catch (err) {
        if (err instanceof ApiError && err.code === "stale") {
          toast.show("Someone else moved that session — reloading");
          void data.reload();
        } else {
          reportError(err);
        }
      }
    },
    [data, event, reportError, slug, timezone, toast],
  );

  const saveSession = useCallback(
    async (body: SessionWrite) => {
      setSaving(true);
      try {
        if (editing?.session) {
          const updated = await api.updateSession(slug, editing.session.id, {
            ...body,
            expectedUpdatedAt: editing.session.updatedAt,
          });
          data.apply({ type: "session.updated", entity: updated });
          toast.show("Session updated");
        } else {
          const created = await api.createSession(slug, body);
          data.apply({ type: "session.created", entity: created });
          toast.show("Session added");
        }
        setEditing(null);
      } catch (err) {
        reportError(err);
      } finally {
        setSaving(false);
      }
    },
    [data, editing, reportError, slug, toast],
  );

  const deleteSession = useCallback(
    async (session: SessionDto) => {
      if (!window.confirm(`Delete “${session.title}”?`)) return;
      try {
        await api.deleteSession(slug, session.id);
        data.apply({ type: "session.deleted", entity: { id: session.id } });
        setEditing(null);
        closeSession();
        toast.show("Session deleted");
      } catch (err) {
        reportError(err);
      }
    },
    [closeSession, data, reportError, slug, toast],
  );

  const addContribution = useCallback(
    async (kind: ContributionKind, body: string, url?: string) => {
      if (!selected) return;
      try {
        const created = await api.addContribution(slug, selected.id, {
          kind,
          body,
          url,
        });
        data.apply({ type: "contribution.created", entity: created });
        toast.show("Added — everyone sees it live");
      } catch (err) {
        reportError(err);
      }
    },
    [data, reportError, selected, slug, toast],
  );

  const removeContribution = useCallback(
    async (id: number) => {
      if (!selected) return;
      try {
        await api.deleteContribution(slug, id);
        data.apply({
          type: "contribution.deleted",
          entity: { id, sessionId: selected.id },
        });
      } catch (err) {
        reportError(err);
      }
    },
    [data, reportError, selected, slug],
  );

  const toggleHidden = useCallback(
    async (contribution: ContributionDto) => {
      try {
        const updated = await api.setContributionHidden(
          slug,
          contribution.id,
          !contribution.hidden,
        );
        data.apply({ type: "contribution.hidden", entity: updated });
      } catch (err) {
        reportError(err);
      }
    },
    [data, reportError, slug],
  );

  if (data.status === "loading") return <Spinner label="Loading schedule…" />;
  if (data.status === "gate") {
    return (
      <Gate slug={slug} me={me} onEntered={() => void data.reload()} />
    );
  }
  if (data.status === "error" || !bundle || !event) {
    return (
      <EmptyState>
        {data.error ?? "Could not load this event."}
        <div className="mt-3">
          <Link to="/" className="underline">
            Back to all events
          </Link>
        </div>
      </EmptyState>
    );
  }

  const role = bundle.role;
  const canWrite = role !== "viewer" && !event.archived;
  const canArrange =
    !event.archived &&
    (role === "admin" ||
      (role === "user" && bundle.rooms.some((r) => r.openTrack)));

  // Ordered coach-marks. Role-conditional controls are dropped here; the Tour
  // itself also skips any target that isn't in the DOM. Not memoised because
  // Tour freezes its own copy on mount.
  const participant = event.userRoleLabel;
  const tourSteps: TourStep[] = [
    {
      target: "identity",
      title: "This is you",
      body: `You're known by a name on this device, not an account — you're here as ${participant}. Open it for your profile, or to sign out.`,
    },
    {
      target: "days",
      title: "Pick a day",
      body: "One tab per day of the event.",
    },
    {
      target: "view",
      title: "Grid or list",
      body: "Grid shows the rooms side by side; list is a plain agenda that reads better on a phone.",
    },
    {
      target: "now",
      title: "Jump to now",
      body: "Scrolls the grid to the current time and the yellow now-line.",
    },
    {
      target: "session-block",
      title: "Open a session",
      body: "Tap any block for its description, speaker and everyone's notes, links and questions. Dashed green blocks are open sessions that anyone may propose.",
    },
    {
      target: "filters",
      title: "Narrow it down",
      body: "Search plus room and tag filters. Filters live in the URL, so a filtered view can be shared as a link.",
    },
  ];
  if (canArrange) {
    tourSteps.push({
      target: "arrange",
      title: "Move things around",
      body: "Turn on Arrange, then drag a block to change its time or room, or drag its bottom edge to change its length. It snaps to 5 minutes and only moves what you may edit.",
    });
  }
  if (canWrite) {
    tourSteps.push({
      target: "add",
      title: "Add a session",
      body: "Organisers add official sessions anywhere; everyone else proposes open sessions in the rooms that anyone may book.",
    });
  }
  tourSteps.push({
    target: "pitches",
    title: "Pitch a session",
    body: "Propose a session with no room or time, and say which pitches you would turn up to. Organisers place the popular ones on the grid.",
  });
  if (role === "admin") {
    tourSteps.push({
      target: "manage",
      title: "Organiser tools",
      body: "Rooms, tags, passwords, duplicating the event and archiving all live behind Manage.",
    });
  }
  tourSteps.push({
    target: "live",
    title: "It's live",
    body: "Everyone else sees your changes within a second, with no refresh needed.",
  });

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      <header className="sticky top-0 z-30 border-b border-stone-200 dark:border-stone-700 bg-stone-50/95 dark:bg-stone-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="flex shrink-0 items-center"
            aria-label="All events"
          >
            <Logo variant="oneline" className="h-5 w-auto sm:h-6" />
          </Link>
          <span
            aria-hidden="true"
            className="hidden h-6 w-px shrink-0 bg-stone-300 dark:bg-stone-700 sm:block"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight">
              {event.name}
            </div>
            <div
              data-tour="live"
              className="truncate text-xs text-stone-500 dark:text-stone-400"
            >
              {days.length} day{days.length > 1 ? "s" : ""} ·{" "}
              {event.archived
                ? "archived — read-only"
                : data.connected
                  ? "schedule is live"
                  : "reconnecting…"}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <ThemeToggle />
            {/* Everyone needs the board: attendees pitch there, viewers can
                register interest. Linking it only from Manage hid it from the
                people it exists for. */}
            <Link
              data-tour="pitches"
              to={`/e/${slug}/proposals`}
              className="rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:border-stone-400 dark:hover:border-stone-500"
            >
              Pitches
              {bundle.proposals.filter((p) => p.placedSessionId === null)
                .length > 0 && (
                <span className="ml-1 text-stone-400 dark:text-stone-500">
                  {
                    bundle.proposals.filter((p) => p.placedSessionId === null)
                      .length
                  }
                </span>
              )}
            </Link>
            {role === "admin" && (
              <Link
                data-tour="manage"
                to={`/e/${slug}/admin`}
                className="rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:border-stone-400 dark:hover:border-stone-500"
              >
                Manage Event
              </Link>
            )}
            <button
              type="button"
              onClick={() => setTourOpen(true)}
              aria-label="Take the tour"
              title="Take the tour"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-xs font-medium text-stone-500 dark:text-stone-400 hover:border-stone-400 dark:hover:border-stone-500"
            >
              ?
            </button>
            <ProfileMenu
              displayName={bundle.displayName}
              slug={slug}
              role={role}
              userLabel={event.userRoleLabel}
              people={bundle.people}
              onSignOut={() => {
                void api.logout(slug).then(() => void data.reload());
              }}
            />
          </div>
        </div>

        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pb-3">
          <div
            data-tour="days"
            className="flex overflow-x-auto rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 p-0.5 no-scrollbar"
          >
            {days.map((d) => {
              const label = dayLabel(d, today);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => filters.set({ day: d })}
                  aria-pressed={day === d}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium ${
                    day === d
                      ? "bg-stone-900 dark:bg-stone-100 dark:text-stone-900 text-white"
                      : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                  }`}
                >
                  {label.top}{" "}
                  <span
                    className={
                      day === d
                        ? "text-stone-300 dark:text-stone-600"
                        : "text-stone-400 dark:text-stone-500"
                    }
                  >
                    {label.sub}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            data-tour="view"
            className="flex rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 p-0.5"
          >
            {(["cal", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => filters.set({ view: v })}
                aria-pressed={view === v}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  view === v
                    ? "bg-stone-900 dark:bg-stone-100 dark:text-stone-900 text-white"
                    : "text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                }`}
              >
                {v === "cal" ? "Grid" : "List"}
              </button>
            ))}
          </div>

          <button
            type="button"
            data-tour="now"
            onClick={jumpToNow}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-stone-900 shadow-sm hover:brightness-95"
          >
            ● Now {fmtMin(nowMinuteOfDay(timezone))}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-xs font-medium text-stone-600 dark:text-stone-300 hover:border-stone-400 dark:hover:border-stone-500"
            >
              Calendar Export
            </button>
            {canArrange && (
              <button
                type="button"
                data-tour="arrange"
                onClick={() => setArrange((a) => !a)}
                aria-pressed={arrange}
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  arrange
                    ? "border-stone-900 bg-stone-900 dark:bg-stone-100 dark:text-stone-900 text-white"
                    : "border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:border-stone-400 dark:hover:border-stone-500"
                }`}
              >
                {arrange ? "Done arranging" : "Arrange Sessions"}
              </button>
            )}
            {canWrite && (
              <button
                type="button"
                data-tour="add"
                onClick={() => setEditing({})}
                className="rounded-lg bg-stone-900 dark:bg-stone-100 dark:text-stone-900 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-700 dark:hover:bg-stone-300"
              >
                + Add session
              </button>
            )}
          </div>
        </div>

        <div className="mx-auto max-w-6xl overflow-x-auto px-4 pb-3 no-scrollbar">
          <div
            data-tour="filters"
            className="flex items-center gap-1.5 whitespace-nowrap"
          >
            <input
              value={filters.q}
              onChange={(e) => filters.set({ q: e.target.value })}
              placeholder="Search title, speaker…"
              aria-label="Search sessions"
              className="w-40 shrink-0 rounded-full border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-1 text-xs outline-none focus:border-stone-500 dark:focus:border-stone-400"
            />
            <Chip
              active={filters.soon}
              onClick={() => filters.set({ soon: !filters.soon })}
            >
              Now / next
            </Chip>
            <Chip
              active={filters.mine}
              onClick={() => filters.set({ mine: !filters.mine })}
            >
              <span
                className={
                  filters.mine ? "" : "text-amber-500 dark:text-amber-400"
                }
              >
                ★
              </span>{" "}
              My agenda ({starredIds.size})
            </Chip>
            <span className="mx-1 h-4 w-px shrink-0 bg-stone-300 dark:bg-stone-600" />
            {bundle.rooms.map((r) => (
              <Chip
                key={r.id}
                active={filters.rooms.includes(r.id)}
                onClick={() => filters.toggleRoom(r.id)}
              >
                {r.name}
              </Chip>
            ))}
            <span className="mx-1 h-4 w-px shrink-0 bg-stone-300 dark:bg-stone-600" />
            {bundle.tags.map((t) => (
              <Chip
                key={t.id}
                dot={t.color}
                active={filters.tags.includes(t.id)}
                onClick={() => filters.toggleTag(t.id)}
              >
                {t.name}
              </Chip>
            ))}
            {filters.active && (
              <button
                type="button"
                onClick={filters.clear}
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-stone-500 dark:text-stone-400 underline hover:text-stone-800 dark:hover:text-stone-200"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-0 sm:px-4">
        {showClashBanner && (
          <div className="mx-4 mt-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-100 dark:bg-amber-950/60 p-3 text-amber-900 dark:text-amber-200 sm:mx-0">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {clashIds.size} sessions on your agenda clash.
                </p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {clashPairs.map(([a, b]) => {
                    const pa = place(a, timezone);
                    const pb = place(b, timezone);
                    return (
                      <li key={`${a.id}-${b.id}`}>
                        {a.title} ({fmtMin(pa.startMin)}–{fmtMin(pa.endMin)})
                        overlaps {b.title} ({fmtMin(pb.startMin)}–
                        {fmtMin(pb.endMin)})
                      </li>
                    );
                  })}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setClashDismissed(clashKey)}
                aria-label="Dismiss agenda clash warning"
                className="-m-1 shrink-0 rounded p-1 text-lg leading-none hover:text-amber-950 dark:hover:text-amber-100"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
        )}
        {bundle.rooms.length === 0 ? (
          <EmptyState>
            No rooms yet.{" "}
            {role === "admin" ? (
              <Link to={`/e/${slug}/admin`} className="underline">
                Add the first one
              </Link>
            ) : (
              "An organiser needs to add one."
            )}
          </EmptyState>
        ) : view === "cal" ? (
          <Calendar
            scrollRef={calRef}
            rooms={bundle.rooms}
            tags={bundle.tags}
            sessions={daySessions}
            matchedIds={matchedIds}
            starredIds={starredIds}
            starCounts={bundle.starCounts}
            timezone={timezone}
            day={day}
            dayStartMin={event.dayStartMin}
            dayEndMin={event.dayEndMin}
            nowMin={nowMin}
            arrange={arrange}
            canEdit={canEdit}
            onOpen={openSession}
            onMove={(s, startMin, durMin, roomId) =>
              void moveSession(s, startMin, durMin, roomId)
            }
          />
        ) : (
          <ListView
            rooms={bundle.rooms}
            tags={bundle.tags}
            sessions={visibleSessions}
            contributionCounts={bundle.contributionCounts}
            starredIds={starredIds}
            starCounts={bundle.starCounts}
            clashingIds={clashIds}
            timezone={timezone}
            day={day}
            nowMin={nowMin}
            onOpen={openSession}
            onToggleStar={(s) => void toggleStar(s)}
          />
        )}

        {bundle.rooms.length > 0 &&
          visibleSessions.length === 0 &&
          otherDayMatches.length === 0 && (
            <EmptyState>
              {filters.active ? (
                <>
                  No sessions match.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={filters.clear}
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                "Nothing scheduled on this day yet."
              )}
            </EmptyState>
          )}

        {otherDayMatches.length > 0 && (
          <section className="px-4 pb-24 pt-2 sm:px-0">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              {visibleSessions.length === 0
                ? `${otherDayMatches.length} match${
                    otherDayMatches.length > 1 ? "es" : ""
                  } on other days`
                : `${otherDayMatches.length} more on other days`}
            </h2>
            <ul className="space-y-2">
              {otherDayMatches.map(({ session, startMin, endMin, date }) => {
                const label = dayLabel(date, today);
                return (
                  <li key={session.id}>
                    <button
                      type="button"
                      onClick={() => openResult(session)}
                      className="block w-full rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-3 text-left shadow-sm hover:shadow"
                    >
                      <div className="truncate text-sm font-semibold">
                        {session.title}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
                        {label.top} {label.sub} · {fmtMin(startMin)}–
                        {fmtMin(endMin)}
                        {session.speaker && ` · ${session.speaker}`}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>

      {selected && (
        <DetailSheet
          session={selected}
          slug={slug}
          rooms={bundle.rooms}
          tags={bundle.tags}
          contributions={data.contributions[selected.id]}
          role={role}
          me={me}
          timezone={timezone}
          canEdit={canEdit(selected)}
          archived={event.archived}
          starred={starredIds.has(selected.id)}
          userLabel={event.userRoleLabel}
          onClose={closeSession}
          onToggleStar={() => void toggleStar(selected)}
          onEdit={() => setEditing({ session: selected })}
          onDelete={() => void deleteSession(selected)}
          onAdd={addContribution}
          onRemoveContribution={(id) => void removeContribution(id)}
          onToggleHidden={(c) => void toggleHidden(c)}
        />
      )}

      {editing && (
        <SessionModal
          session={editing.session}
          rooms={bundle.rooms}
          tags={bundle.tags}
          people={bundle.people}
          role={role}
          timezone={timezone}
          days={days}
          dayLabels={dayLabels}
          defaultDay={day}
          dayStartMin={event.dayStartMin}
          dayEndMin={event.dayEndMin}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={(body) => void saveSession(body)}
          onDelete={
            editing.session
              ? () => void deleteSession(editing.session as SessionDto)
              : undefined
          }
        />
      )}

      {arrange && (
        <div className="fixed bottom-4 right-4 z-40 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-xs text-stone-600 dark:text-stone-300 shadow">
          Drag sessions you may edit · snaps to 5 min
        </div>
      )}

      {exportOpen && (
        <CalendarExportModal
          slug={slug}
          starredCount={starredIds.size}
          onClose={() => setExportOpen(false)}
        />
      )}

      {tourOpen && (
        <Tour steps={tourSteps} eventKey={slug} onClose={closeTour} />
      )}
    </div>
  );
}

/** Download a one-off .ics, or mint a personal subscription link for the feed
 *  that follows your starred agenda. */
function CalendarExportModal({
  slug,
  starredCount,
  onClose,
}: {
  slug: string;
  starredCount: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subUrl, setSubUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const base = `/api/e/${encodeURIComponent(slug)}/calendar.ics`;

  // Both scopes are worth subscribing to: the whole programme, or only what
  // you starred. The token is the same either way.
  const subscribe = useCallback(
    async (mine: boolean) => {
      setLoading(true);
      try {
        const { token } = await api.calendarToken(slug);
        setSubUrl(
          `${window.location.origin}${base}?token=${encodeURIComponent(token)}${
            mine ? "&mine=1" : ""
          }`,
        );
      } catch (err) {
        toast.show(
          err instanceof ApiError
            ? err.message
            : "Could not create a subscription link",
        );
      } finally {
        setLoading(false);
      }
    },
    [base, slug, toast],
  );

  const copy = useCallback(async () => {
    if (!subUrl) return;
    try {
      // Rejects on insecure origins — fall back to a manual selection.
      await navigator.clipboard.writeText(subUrl);
      toast.show("Link copied");
    } catch {
      inputRef.current?.select();
      toast.show("Press Ctrl/Cmd+C to copy the selected link");
    }
  }, [subUrl, toast]);

  return (
    <Modal title="Calendar" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div>
          <p className="font-medium text-stone-800 dark:text-stone-200">
            Download
          </p>
          <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
            A one-off snapshot you can import into any calendar app.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={base}
              download
              className="rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:border-stone-500 dark:hover:border-stone-400"
            >
              Whole schedule
            </a>
            {starredCount > 0 ? (
              <a
                href={`${base}?mine=1`}
                download
                className="rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:border-stone-500 dark:hover:border-stone-400"
              >
                My agenda ({starredCount})
              </a>
            ) : (
              <span className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2 text-xs font-semibold text-stone-400 dark:text-stone-500">
                My agenda — star some sessions first
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-stone-200 dark:border-stone-700 pt-4">
          <p className="font-medium text-stone-800 dark:text-stone-200">
            Subscribe
          </p>
          <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
            A live link your calendar app refreshes on its own. It is personal
            to you — anyone who has it can read the schedule.
          </p>
          {subUrl ? (
            <div className="flex gap-2">
              <input
                ref={inputRef}
                readOnly
                value={subUrl}
                aria-label="Personal calendar subscription link"
                onFocus={(e) => e.currentTarget.select()}
                className={inputClass}
              />
              <SecondaryButton className="shrink-0" onClick={() => void copy()}>
                Copy
              </SecondaryButton>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <PrimaryButton
                onClick={() => void subscribe(false)}
                disabled={loading}
              >
                {loading ? "Creating…" : "Link to the whole schedule"}
              </PrimaryButton>
              <SecondaryButton
                onClick={() => void subscribe(true)}
                disabled={loading || starredCount === 0}
              >
                Link to my agenda
              </SecondaryButton>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
