# Project Status

The shared queue: what is in flight, what is blocked, and what is planned.
Shipped work moves to [CHANGELOG.md](CHANGELOG.md) and is not repeated here.

Last updated: 2026-08-30

## In Progress

Working directly on `main` (the `feat/ui-overhaul` branch merged 2026-08-30).
Shipped work is in CHANGELOG.md under `[Unreleased]`; what is left of that
plan lives in `_planning/plans/2026-08-29-ui-overhaul-permissions-pitches.md`:

- **Pitch board.** Always show the creator, default the creator as host,
  up/down votes replacing proposal interest, and a hot/new split. Not started.
- **Whole-app UI sweep.** The primitives landed and the admin page is done;
  20 underline usages remain across SchedulePage (4), ProposalBoard (4),
  DetailSheet (4), ProfilePage (5), EventListPage (1), NewEventPage (1) and
  Tour (1). The count excludes the three `[&_a]:underline` in prose wrappers —
  links inside rendered markdown keep their underline deliberately — and
  IdentityPanel, which was deleted on 2026-08-30 when the identity modal became
  a menu.
- **ARCHITECTURE.md concurrency paragraph.** §Realtime documents broadcast and
  heartbeats but never states the model: last-write-wins, `assertNotStale`
  409 on an `updated_at` mismatch, no CRDT by design.

## Blockers

- **Identity and duplicate people needs decisions.**
  `_planning/specs/identity-and-people.md` sets out the problem and options but
  takes no decision. Four questions are open: whether a device-transfer code
  crosses the "no accounts" line, whether a transfer carries the role, whether
  merge is admin-only, and whether stars transfer at all. The third one shapes
  the permission matrix, so it wants answering before merge is built.
  Migration 009 moved the ground under this: a display name now belongs to
  `(event, identity)` and is unique inside the event, so "the name a second
  device cannot reclaim" is now per event rather than global. The spec's
  options want rereading against that.

---

# Backlog

_The only queue of future work, priority-ordered. Top High-Priority item = next up._

## High Priority

- It should be possible to change name of the main event. Preferably also the link (subpage).
- **People dedupe/merge.** Anyone who can create a session or a pitch can create
  a person by typing a new speaker name, so "A. Lovelace" and "Ada Lovelace" can
  coexist. Right for an unconference, but there is no merge tool.

## Medium Priority

- **Number fields accept nonsense.** Room capacity is `type="number" min={0}`,
  which the browser enforces on the spinner but not on typing or paste; the
  client strips a minus sign and `parseCapacity` floors it, and the server
  takes whatever arrives. Same shape wherever a number is typed. Wants one
  validated numeric input primitive rather than a guard per field.

- **No write path under flaky connectivity.** Reads recover well — `EventSource`
  auto-reconnects and `useEventData` refetches the whole bundle on reopen, and
  the header shows "reconnecting…". Writes do not: every mutation is a bare
  `fetch` with no queue or retry, so a star/note/edit attempted while offline
  fails with a toast and is lost. There is also no service worker, so a cold
  load with no connectivity renders nothing. Full offline editing is an explicit
  v1 non-goal (SPEC §Non-goals — no CRDT), but a small outbox that retries
  queued writes on reconnect would cover the hallway-wifi case without one.

- **Dependency bumps — all need major upgrades, none currently exploitable here.**
  Assessed 2026-08-28:
  - `vitest` 2.x, _critical_ — only reachable when the Vitest **UI server** is
    listening. We never run `vitest --ui`. Fix is vitest@4 (breaking).
  - `vite` 5.x, _high_ — `server.fs.deny` bypass **on Windows**. Dev-only, and
    this project builds on Linux. Fix is vite@8 (breaking).
  - `esbuild` (via Vite), _moderate_ — any website can call the dev server and
    read the response. Worth knowing because our dev server binds `0.0.0.0`
    for the container; does not affect production, which serves static files.
  - `react-router-dom` 6.x, _moderate_ — the one advisory that ships. Open
    redirect via a backslash in `<Link>`/`useNavigate`; the companion SSR
    `deserializeErrors` issue does not apply (no SSR). Every navigation we
    build is prefixed with a literal `/e/`, so a path cannot start `//` or
    `\\`. Fix is react-router-dom@7 (breaking).
- **Manual browser pass.** Automated coverage is server-side; the drag, now-line
  and 360px checks still want a human look — now more so, with dark mode, the
  proposal board and the agenda banner added.
- **Deploy paths are written but unverified.** Neither `docker` nor the
  `sqlite3` CLI exists in this dev container, so `deploy/Dockerfile`,
  `deploy/docker-compose.yml` and `deploy/backup.sh` have never actually been
  run. They follow the spec and standard practice, but treat the first VPS
  deploy as the real test.
- **No UI test coverage.** All 210 tests are server-side; there is no
  jsdom/testing-library stack at all. The drag maths, the SSE reducer and the
  clash detection are the parts most likely to regress silently — and the
  build-stamp crash on 2026-08-30 (a component that threw on every render,
  blanking the page, while the whole suite stayed green) is what that gap
  costs. A React error boundary would have contained it; there is none.

## Low Priority / Ideas

- **README screenshot.** Asked for on 2026-08-28 but not possible from the dev
  container — there is no browser and the Playwright/Puppeteer binaries cannot
  be fetched through the firewall. Needs a PNG dropped in by hand.
- **Print / PDF grid.** Unconferences put the grid on a wall. A print
  stylesheet would cover most of it.
- **Restore for rooms and tags.** `/trash` covers sessions and contributions,
  which are the vandalism targets; rooms and tags soft-delete too but have no
  restore path.

---

# Out of scope

Deliberately not built, so nobody re-litigates them by accident:

- Session voting, per-room QR codes, email of any kind, multi-language,
  image uploads, WebSockets, and per-user accounts. The last two matter most:
  SSE and shared per-event passwords are load-bearing design choices, not
  placeholders.

Dark mode, iCal export and personal "my agenda" starring were on this list
originally (SPEC §12) and were pulled in deliberately on 2026-08-28.

"Session voting" stays out for the **programme** — nobody votes a scheduled
session up or down. Voting on the **pitch board** was pulled in deliberately on
2026-08-29: up/down votes are replacing proposal interest counts, so organisers
can see which pitches deserve a room. The board/programme line is the whole of
the distinction.
