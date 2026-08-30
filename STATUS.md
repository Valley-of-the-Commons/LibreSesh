# Project Status

The shared queue: what is in flight, what is blocked, and what is planned.
Shipped work moves to [CHANGELOG.md](CHANGELOG.md) and is not repeated here.

Last updated: 2026-08-30

## In Progress

Working directly on `main`. 0.2.0 was tagged 2026-08-30; what shipped is in
CHANGELOG.md under `[0.2.0]`. What is left of the UI-overhaul plan lives in
`_planning/plans/2026-08-29-ui-overhaul-permissions-pitches.md`:

- **Pitch board.** Always show the creator, default the creator as host,
  up/down votes replacing proposal interest, and a hot/new split. Not started.
- **Whole-app UI sweep.** The primitives landed and the admin page is done;
  21 underline usages remain across ProfilePage (5), SchedulePage (4),
  ProposalBoard (4), DetailSheet (4), EventListPage (1), NewEventPage (1),
  Tour (1) and Gate (1, the "already here on another device" link added with
  device linking). The count excludes the `[&_a]:underline` in prose wrappers —
  links inside rendered markdown keep their underline deliberately — and the
  five in `ui.tsx`, which are the primitives themselves.
- **ARCHITECTURE.md concurrency paragraph.** §Realtime documents broadcast and
  heartbeats but never states the model: last-write-wins, `assertNotStale`
  409 on an `updated_at` mismatch, no CRDT by design.

## Blockers

_None._ The identity design question that sat here is decided and shipped —
see `_planning/specs/identity-and-people.md` §Decisions for the reasoning and
CHANGELOG `[Unreleased]` for what landed.

---

# Backlog

_The only queue of future work, priority-ordered. Top High-Priority item = next up._

## High Priority

- It should be possible to change name of the main event. Preferably also the link (subpage).
- **Merge moves the person, not their history.** `POST /people/:id/merge`
  repoints `sessions.speaker_id` and `proposals.speaker_id` and abandons the
  loser identity — but stars, contributions, `sessions.created_by`,
  `proposals.created_by` and proposal interest are all keyed on
  `identities.id` and stay behind. So after a merge the notes and questions
  the person wrote on their duplicate device are attributed to an identity with
  no display name in the event, and they can no longer delete their own words.
  Adoption (the link phrase) has none of this — both devices *are* one identity
  — so this only bites the fallback path, where two histories already exist.
  Wants the merge transaction to re-key those five tables onto the survivor,
  de-duplicating the two composite keys (`stars`, `proposal_interest`) as it
  goes.

- **Old migration backups pile up.** Each upgrade with pending migrations
  leaves a `*.backup-<stamp>` file beside the DB and nothing prunes them.
  Fine for now (one file per deploy); wants a keep-last-N sweep eventually.

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
- **Cloning still demands all three passwords.** Creating an event lets you
  leave any of them blank — a four-word phrase is generated and shown once on
  a confirmation screen — but `POST /events/:slug/clone` kept the old
  all-required schema. Deliberate for now: the clone UI has nowhere to reveal
  a generated secret, and an organiser who never sees one cannot hand it out.
  Wants the same reveal screen, then `resolveEventPasswords` wired into the
  clone route so the two creation paths stop disagreeing.

- **Manual browser pass.** Automated coverage is server-side; the drag, now-line
  and 360px checks still want a human look — now more so, with dark mode, the
  proposal board and the agenda banner added.
- **Deploy paths are now only *partly* unverified.** `deploy/Dockerfile` is
  real as of 2026-08-30: a Railway instance builds from it (`railway.json`
  pins the builder, since Railway's Node autodetection runs a plain `npm ci`
  that honours our `ignore-scripts=true` and so never builds better-sqlite3).
  That exercises the image, the migrations and the boot-time demo seed. The
  compose path is still untried — neither `docker` nor the `sqlite3` CLI
  exists in this dev container — so `deploy/docker-compose.yml`, the Caddy
  front end and `deploy/backup.sh` have never actually been run. Treat the
  first VPS deploy as their real test.
  Railway-specific notes live in `_planning/deployment-guide.md` §10.
- **No component test coverage, and no error boundary.** 305 tests, and the
  only web-side ones (`format.test.ts`, `calendar.test.ts`) cover pure
  functions — there is no jsdom/testing-library stack, so nothing renders a
  component. The drag maths, the SSE reducer and the clash detection are the
  parts most likely to regress silently, and the Calendar column refactor on
  2026-08-30 went in on a read-through alone. The build-stamp crash the same
  day — a component that threw on every render, blanking the page, while the
  whole suite stayed green — is what the gap costs. A React error boundary
  would have contained it; there is still none.

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
