# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added

- **Per-event permission matrix.** Nine capabilities — commenting, moderating,
  pitching, voting, starring, creating and editing open sessions, editing your
  own profile — each assignable to any of the three roles, edited from the
  admin page and enforced server-side by `requireCapability`. Defaults
  reproduce the previous fixed matrix exactly, and only differences from them
  are stored. The organiser column is locked on: an event nobody can moderate
  would have no way back. Structural rules stay fixed — official sessions
  remain organiser-only and open sessions still need an open-track room.
- **Room colours.** Every room carries a colour, shown on its schedule column
  and its header card, and editable in the admin room editor from a palette of
  washed-out watercolour tints or a free-form picker. A new room defaults to
  the first colour none of its neighbours is using. Existing rooms are spread
  across the palette by column order on migration.
- **Room editing.** Capacity and description are editable after creation. The
  API had always accepted them; the admin page exposed neither.
- **Session livestream link.** Optional http(s) link on a session, hidden
  entirely when unset rather than shown as an empty row.
- **Demo mode** (`DEMO_MODE=1`, `npm run dev:demo`). The event gate becomes a
  role picker instead of a password prompt, for public demo deployments. An
  env var rather than a per-event column, so it cannot survive an event clone
  or be flipped on a real event by mistake. Off by default, warns at boot.
- **Build stamp.** The nearest git tag, short commit and build time are stamped
  at build time and shown bottom-right — outright on demo instances, on hover
  elsewhere. Dockerfile takes `BUILD_TAG`/`BUILD_COMMIT` build args, since that
  stage has no `.git`.

### Changed

- **Form layout primitives.** `Field` no longer carries its own bottom margin,
  which had forced every adjacent button to hardcode a matching `mb-3` to sit
  on the same baseline — and broke whenever a field grew a hint. Spacing now
  belongs to `FormStack`/`FormRow`/`FormGrid`. Adds `Section`, `DangerButton`,
  `IconButton`, `TextLink` and `Toggle`; the admin page moves onto them, losing
  its underlined-at-rest links and its text-link "delete" actions.
- **Identity is held in context.** `useMe` fetched `/me` wherever it was
  called, so a second caller meant a second round trip for the same answer.
- The demo event's open-track room is called "Unconf Room".
- **Nothing user-facing calls a booking permission a "track" any more.** No
  track is implemented anywhere — `rooms.open_track` is a boolean meaning
  "attendees may schedule here" — so the schedule badge now reads "anyone may
  book", and the session modal and tour say what they mean.
- **The schedule's room band is detached from the grid.** Each room is a
  card with a "Room" axis label beside it, rather than a row of table cells
  flush on the time grid, which read as weekday headers.

### Fixed

- **The build stamp took the whole app down in dev.** Vite's `define` is only
  substituted in a production build, so the identifiers survived verbatim and
  threw `ReferenceError` on render — with no error boundary, that blanked the
  page. Now read from `import.meta.env`, with defaults rather than assertions.

## [0.1.0] — 2026-08-29

First release. Everything below is new.

### Added

- **Schema and migrations.** Numbered `.sql` migrations applied at boot, SQLite
  in WAL mode with foreign keys on. Soft deletes throughout and an append-only
  audit log of every write.
- **Anonymous identity.** A signed httpOnly cookie minted on first contact, with
  a renamable display name. No accounts, no email.
- **Per-event roles.** Three shared passwords per event — viewer, user, admin —
  checked highest first. Entering a higher password upgrades your role; a lower
  one downgrades it. Viewing requires the viewer password, so schedules are
  never public.
- **Rooms, tags, sessions and contributions API.** The permission matrix is
  enforced server-side: users may only place open sessions in open-track rooms,
  inside the event dates and day viewport, and never overlapping; admins may
  double-book. Edits carry `expectedUpdatedAt` and return 409 when stale.
- **Live updates over SSE.** One in-process channel per event with a 25-second
  heartbeat. Every write publishes the fresh entity, so clients patch a single
  bundle by id instead of refetching.
- **Schedule UI.** Calendar and list views on a five-minute grid, day tabs, a
  live now-line with a "Now" jump button, and deep-linked session sheets.
  Mobile-first, down to 360px.
- **Editing UI.** Create/edit modals for admins and open-track users, drag to
  move and resize (250ms hold on touch), conflict toasts with snap-back, plus an
  admin page for rooms, tags, passwords and archiving.
- **Contributions.** Notes, links and questions per session, grouped by kind,
  with author names and relative times. Authors delete their own; admins delete
  or hide anything. Descriptions render as markdown with raw HTML escaped
  before parsing.
- **Duplicate an event.** Organisers can clone an event from its admin page;
  rooms and tags carry over, sessions and contributions do not.
- **Reorderable room columns.** Arrow controls in the admin page, renumbering
  the list so rooms created before this existed sort themselves out.
- **Overlap badge.** Admins may double-book a room, so clashing blocks are
  badged on the calendar rather than prevented.
- **Proposal board.** Pitch a session with no room or time, register interest in
  other people's pitches, and let organisers place the popular ones on the grid.
  Placing carries the pitch's tags, speaker and interested people across.
- **Undo for deletions.** Organisers can list and restore soft-deleted sessions
  and contributions. Restoring a session whose room has since been deleted is
  refused rather than resurrecting a dangling reference.
- **Star counts.** How many people have a session on their agenda, flagged when
  it exceeds the room's capacity.
- **Agenda clash warnings.** Two starred sessions that overlap are called out,
  in the banner and on the row.
- **Cross-day search.** Text search reaches every day of the event, not only the
  one on screen.
- **Personal agenda.** Star sessions to build your own agenda, filter the
  schedule down to it, and share that filter as a link. Stars are private to
  you and never broadcast.
- **Calendar export.** Download the whole schedule or just your starred agenda
  as an `.ics` file, or take a personal subscription link your calendar app
  refreshes on its own. The link authenticates by capability token, since a
  calendar app cannot present a session cookie, and only ever grants what your
  role already allows.
- **Dark mode.** Light, dark, or follow the system setting.
- **Speaker and host profiles.** Speakers are per-event records rather than free
  text, each with a bio, links and a page listing their sessions. Organisers
  curate the roster; anyone with a role owns at most one profile and may edit
  it, viewers included.
- **Guided tour.** Seven to ten coach marks on first visit, anchored to the real
  controls and tailored to your role. Replayable from the header.
- **Named participant role.** Each event chooses what it calls its middle role,
  defaulting to "attendee"; anonymous identities are `attendee_xxxxx`.
- **Filters in the URL.** Room and tag multi-select, free-text search and a
  "now / next" quick filter, all held in the query string so a filtered view is
  shareable.
- **Rate limiting.** In-memory token buckets keyed by identity *and* IP. Auth is
  capped at 5 attempts per 15 minutes, refunding the token on success.
- **Deployment.** Docker Compose and systemd run modes behind Caddy, a nightly
  `VACUUM INTO` backup script with retention, and a VPS runbook in the README.
- **Tests.** 171 Vitest cases covering the role matrix, session and proposal
  write rules, overlap and stale-edit handling, contribution moderation, undo,
  the rate limiter, timezone maths, iCal generation and the SSE stream.
- **Documentation.** `ARCHITECTURE.md` describes the design and the threat
  model — including what is deliberately *not* defended against.
