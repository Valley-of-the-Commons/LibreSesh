# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Changed

- Renamed the project to **LibreSesh**.

### Fixed

- Clicking a session block on the calendar opens it. Outside Arrange mode no
  role could open a session by pointer — only the keyboard worked.

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
- **Tests.** 111 Vitest cases covering the role matrix, session write rules,
  overlap and stale-edit handling, contribution moderation, the rate limiter,
  timezone maths and the SSE stream.
