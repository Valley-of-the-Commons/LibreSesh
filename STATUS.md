# Project Status

The shared queue: what is in flight, what is blocked, and what is planned.
Shipped work moves to [CHANGELOG.md](CHANGELOG.md) and is not repeated here.

Last updated: 2026-08-31

## In Progress

Working directly on `main`. 0.2.0 was tagged 2026-08-30; what shipped is in
CHANGELOG.md under `[0.2.0]`, and what has landed since is under
`[Unreleased]`. What is left of the UI-overhaul plan lives in
`_planning/plans/2026-08-29-ui-overhaul-permissions-pitches.md`:

- **Whole-app UI sweep.** The primitives landed and the admin page is done.
  21 underline usages remain across ProfilePage (5), SchedulePage (4),
  ProposalBoard (4), DetailSheet (4), EventListPage (1), NewEventPage (1),
  Tour (1) and Gate (1, the "already here on another device" link added with
  device linking). The count excludes the `[&_a]:underline` in prose wrappers —
  links inside rendered markdown keep their underline deliberately — and the
  five in `ui.tsx`, which are the primitives themselves. Re-counted 2026-08-31:
  unchanged, since the new Backup tab uses `no-underline` on its download link.
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

- **Pitch board.** Always show the creator, default the creator as host, and
  split the board into hot/new. The plan is
  `_planning/plans/2026-08-29-ui-overhaul-permissions-pitches.md`, whose
  up/down-vote assumption is **withdrawn** (decided 2026-08-31): interest stays
  one-way, so no `proposal_votes` table, no migration, and `interestCount`
  keeps its name and its meaning in `EventExport`. The button already wears an
  up-arrow rather than a star, which was only ever about the glyph colliding
  with "on my agenda".

- **Merge moves the person, not their history.** `POST /people/:id/merge`
  repoints `sessions.speaker_id` and `proposals.speaker_id` and abandons the
  loser identity — but stars, contributions, `sessions.created_by`,
  `proposals.created_by` and proposal interest are all keyed on
  `identities.id` and stay behind. So after a merge the notes and questions
  the person wrote on their duplicate device are attributed to an identity with
  no display name in the event, and they can no longer delete their own words.
  Adoption (the link phrase) has none of this — both devices _are_ one identity
  — so this only bites the fallback path, where two histories already exist.
  Wants the merge transaction to re-key those five tables onto the survivor,
  de-duplicating the two composite keys (`stars`, `proposal_interest`) as it
  goes.

- **A merged-away or deleted person keeps a live speaker code.** Verified
  2026-08-31 against the running app: mint a code for a profile, merge it into
  another (or delete it outright), and the phrase still redeems — the stranger
  who types it adopts that identity and lands in the event with the **speaker**
  role. Neither `POST /people/:id/merge` nor `DELETE /people/:id` touches
  `link_codes`, and `redeemLinkCode` never checks whether the bound person is
  soft-deleted. Worse, it cannot be taken back through the UI: the revoke route
  loads the person first and a soft-deleted one is a 404, so the only way to
  kill the code is SQL. Both routes should revoke inside their transaction —
  and the person delete arguably should too when the profile was claimed.

- **Old migration backups pile up.** Each upgrade with pending migrations
  leaves a `*.backup-<stamp>` file beside the DB and nothing prunes them.
  Fine for now (one file per deploy); wants a keep-last-N sweep eventually.

## Medium Priority

- **Nothing imports an event export.** `GET /export.json` writes a complete
  archive of an event and there is no route that reads one back, so the JSON is
  a hand-off and a record, not a restore path — the encrypted whole-DB backup
  is the only way back. An importer would want a new slug, fresh ids, and a
  decision about what to do with authorship names that belong to identities the
  target instance has never seen.

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

- **Manual browser pass — now with a specific backlog.** Automated coverage is
  server-side, so four UI changes shipped on 2026-08-30 on a read-through
  alone (no browser in this dev container, no component tests). Each wants a
  real look, ideally on a phone:
  - the `Modal` rewrite — overlay scrolls, `dvh` cap — against the tallest
    modal there is, and the one it was reported on ("Link another device");
  - the schedule header on a narrow screen: theme now lives in the profile
    menu, Manage/Arrange/Add sit together and go icon-only below `sm`. Watch
    where the action row chooses to wrap;
  - the tour no longer auto-starting for an organiser, while "?" still opens
    it;
  - the drag, now-line and 360px checks that were already outstanding.
- **Deploy paths, and what is actually proven.** Railway builds from
  `deploy/Dockerfile` (`railway.json` pins the builder — Railway's Node
  autodetection runs a plain `npm ci`, which honours our `ignore-scripts=true`
  and so never builds better-sqlite3). Two failures found the hard way on
  2026-08-30, both now startup errors instead of silent damage:
  no volume attached, so a rebuild destroyed the event on it; then a
  root-owned volume the unprivileged app could not write, surfacing only as
  `SQLITE_CANTOPEN`. `server/src/preflight.ts` reports every misconfiguration
  at once, and `deploy/entrypoint.sh` chowns the volume before dropping to
  `node`.
  **Still unproven:** there is no `docker` in this dev container, so the
  entrypoint's _root_ branch and the `gosu` install have never executed — the
  next deploy is their first real run. `deploy/docker-compose.yml`, the Caddy
  front end and `deploy/backup.sh` have never been run at all; treat the first
  VPS deploy as their test. Railway notes: `_planning/deployment-guide.md` §10.
- **No component test coverage, and no error boundary.** 326 tests, and the
  only web-side ones (`format.test.ts`, `calendar.test.ts`) cover pure
  functions — there is no jsdom/testing-library stack, so nothing renders a
  component. The drag maths, the SSE reducer and the clash detection are the
  parts most likely to regress silently, and the Calendar column refactor on
  2026-08-30 went in on a read-through alone. The build-stamp crash the same
  day — a component that threw on every render, blanking the page, while the
  whole suite stayed green — is what the gap costs. A React error boundary
  would have contained it; there is still none.

## Low Priority / Ideas

- **Quadratic voting on pitches.** Floated 2026-08-31 for a future instance,
  explicitly not for this one: it changes what a vote *is* (a budget spent
  across pitches, not a click per pitch), so it wants its own schema and its
  own thinking rather than a column bolted onto `proposal_interest`.

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

Deliberately not built, so nobody re-litigates them by accident. Checked
against the code on 2026-08-30:

- **Per-user accounts** and **WebSockets**. These two matter most: SSE and
  shared per-event passwords are load-bearing design choices, not placeholders.
  The identity model has grown a lot since — profiles, device linking, speaker
  codes — but every bit of it is deliberately account-free: a speaker code
  binds a phrase to a person, and never asks for an email or a password.
- **Email of any kind**, **image uploads**, **multi-language**, and **per-room
  QR codes**. Still true to the letter — there is no mail, upload, i18n or QR
  code anywhere in the tree.

## Voting: pitches yes, programme no

**Pitches are votable, and have been since the board shipped.** The
`proposal.vote` capability (`server/src/shared/capabilities.ts`) is granted to
every role by default, viewers included; `proposal_interest` stores it and the
board sorts by the count. Up/down votes were queued to replace that one-way
interest and were **dropped on 2026-08-31** — interest stays as it is, and
quadratic voting is parked under Low Priority for a future instance. The
hot/new split is still queued, under High Priority.

What stays out is voting on the **programme**: nobody votes a scheduled session
up or down. The board/programme line is the whole of the distinction, and it is
the only thing "no session voting" ever meant.

## Pulled in deliberately

Dark mode, iCal export and personal "my agenda" starring were on this list
originally (SPEC §12) and were pulled in on 2026-08-28. Pitch-board voting was
clarified as in-scope on 2026-08-29.
