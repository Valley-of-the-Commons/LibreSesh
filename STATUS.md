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
  27 underline usages remain across SchedulePage, ProposalBoard, DetailSheet,
  ProfilePage, EventListPage, NewEventPage, IdentityPanel and Tour. Links
  inside rendered markdown keep their underline deliberately.
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

---

# Backlog

_The only queue of future work, priority-ordered. Top High-Priority item = next up._

## High Priority

- Demo mode: Open Track rename to "Open Room". It should be possible to login w/o password, just click the roles.
- It should not be possible to enter a username that is already taken.
- **People dedupe/merge.** Anyone who can create a session or a pitch can create
  a person by typing a new speaker name, so "A. Lovelace" and "Ada Lovelace" can
  coexist. Right for an unconference, but there is no merge tool.

## Medium Priority

- **Grid columns read as tracks, not rooms.** The calendar's column header
  renders the room name, its capacity, and then the literal words "open track"
  in emerald (`Calendar.tsx:285`), so a column reads *"Workshop A · 60 seats ·
  open track"*. The gutter cell above the time axis is empty, so nothing says
  the columns are rooms at all. `rooms.open_track` means "attendees may
  schedule here" and has nothing to do with tracks — a room is a place, a
  track is a thematic strand that can span several rooms and days.

  Proposed in three tiers, cheapest first. They are independent; the first may
  be the whole fix.

  1. **Relabel, no schema change.** Change the badge from "open track" to what
     the flag actually means ("anyone may book"), and label the empty gutter
     cell "Room". This addresses the reported confusion directly and is maybe
     an hour's work.
  2. **Rename the column** `rooms.open_track` → `rooms.open_booking`, so the
     code stops implying a track concept it does not have. Internal clarity
     only; touches the DTO, the admin toggle and the seed.
  3. **Tracks as a real concept** — *only if organisers actually ask for it.*
     A track would be a promoted tag (`tags.kind` of 'label' | 'track'),
     reusing the existing colour, filter, CRUD and session-tag plumbing rather
     than adding a third entity, plus a "column by: Room | Track" toggle on
     the grid. This is the expensive part and the most speculative: nobody has
     asked to *group* by track, only noted that the header is misleading. If
     tier 1 resolves that, tier 3 may never be worth building.

  Recommend doing 1 and 2 and stopping there until there is real demand.


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
- **No UI test coverage.** All 170 tests are server-side. The drag maths, the
  SSE reducer and the clash detection are the parts most likely to regress
  silently.

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
Proposal interest counts are close to "session voting" but sit on the pitch
board rather than the programme, which is the distinction that matters.
