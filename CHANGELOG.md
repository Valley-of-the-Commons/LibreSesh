# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added

- **Link another device.** The menu behind your name mints a three-word phrase
  (`pine-otter-lantern`); typing it at the gate on another device makes that
  device *you* — same name, role, stars and sessions — closing the "my phone
  is a stranger" hole. Phrases are single-use, expire after ten minutes, are
  stored hashed, and guesses share the password rate-limit budget.

- **Speaker search instead of a dropdown.** The speaker field on sessions and
  pitches is now a combobox that searches the roster case- and
  whitespace-insensitively; creating a person is an explicit "Add … as someone
  new" action, never the silent result of a typo. The server matches the same
  way (and prefers a claimed profile over an unclaimed twin), so "ada lovelace"
  no longer spawns a duplicate of "Ada Lovelace".

- **Merge duplicate people.** Organisers can fold one profile into another from
  the profile page: sessions and pitches are repointed, blanks fill from the
  duplicate, a claim on the duplicate moves to the survivor, and the duplicate
  is soft-deleted. Audited; not undoable via /trash, hence admin-only.

## [0.2.0] — 2026-08-30

### Added

- **A "?" beside the session type.** Official versus open is an authority
  distinction, not a scheduling one, and nothing on screen said so. The note
  explains that official is the published programme, open is attendee-placed
  and stays editable by whoever put it up — so promoting a session to official
  locks it against its creator — and that neither type affects timing.

- **Tracks.** Thematic strands running across rooms and days, defined per event
  from the admin page and ordered like rooms, because that order is the order
  of the columns. A session sits on at most one — unlike a tag, because the
  grid can lay tracks out as its columns and a session occupies exactly one
  column. Once an event has any, the grid gains a Rooms / Tracks switch; read
  by track, each block gains its room on the card, and sessions with no track
  gather in a trailing "Unassigned" column rather than vanishing. Deleting a
  track keeps its sessions — they lose the track, not their room. The choice
  rides in the URL like every other filter. An event with no tracks is
  untouched and never mentions them.

- **Week grouping for long events.** Past a threshold the schedule's day tabs
  stop being one horizontal scroller and split in two: a rail of weeks, each
  labelled with its dates and its session count, and below it only that week's
  days. Days with nothing scheduled are dimmed, and the week holding today is
  marked. The threshold is an event setting — "Group days into weeks past",
  default 8 days — so a one- to three-day unconference looks exactly as it did.
  The selected week is derived from the selected day rather than held in state,
  so a shared `?day=` link still opens on the right week.

- **A fortnight-long demo event.** `npm run seed:long` builds "LongConf 2026"
  — fourteen days from today, weekends clear, alongside the two-day DemoConf
  rather than replacing it. The seed takes `SEED_SLUG`, `SEED_NAME` and
  `SEED_DAYS`, so any length is one command away; `npm run seed` is unchanged.

- **Tag editing.** A tag's name was fixed at creation — the API had accepted a
  rename since the beginning, the admin page just never offered one, and the
  only editable thing was a colour swatch that saved on blur with no way back.
  Clicking a tag now opens an editor with name, colour, and a delete that first
  says how many sessions and pitches carry it.

- **Display names are unique per event.** `PATCH /me` wrote the name with no
  check at all, so anyone could take an organiser's. The name now belongs to
  `(event, identity)` and is unique inside the event — not across the instance,
  which would have let the first person to type "Ada" hold it everywhere
  forever. You claim it at the gate, where a clash comes back in place before
  any role is granted, and change it on your profile. The same name in two
  different events is two different people, and each session or note is
  credited to the name its author uses there.

- **Brand assets.** The LibreSesh logo replaces the placeholder initial-letter
  square: the stacked mark with its "open source scheduling" tagline heads the
  event list, and the one-line wordmark sits in the schedule header, linking
  home. Each variant ships light and reversed artwork rather than one tinted
  with `currentColor`, because the mark is three colours — dark mode *darkens*
  the calendar cells while it lightens the wordmark. An SVG favicon and a
  180px apple-touch-icon are linked from `index.html`.
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

- **`rooms.open_track` is `rooms.open_booking`.** The column never held a
  track — it is a boolean meaning "attendees may schedule here". The word left
  the UI on 2026-08-30; with real tracks now in the schema the name had gone
  from vague to wrong, so the column, `RoomDto.openTrack`, the API field and
  the "not an open track" error all follow. `openBooking` is a breaking change
  to the room API.

- **The permission matrix opens locked.** Every switch in it saves the instant
  you click it and there is no undo, so it now greys out until the organiser
  password is typed. A new `POST /e/:slug/confirm-admin` checks the password
  and grants nothing — deliberately not the auth endpoint, which upserts a
  role, so an organiser who typed the *viewer* password into a confirmation box
  would have quietly demoted themselves out of the page they were standing on.

- **Room cards lead with what you can do in the room.** "Attendees may book
  this room" moves above the capacity rather than trailing it. Capacity is a
  three-digit number in a narrow field now, not a half-width one, and a typed
  minus sign is dropped. The colour a new room will get is a note beside the
  button rather than a form field pretending to be editable, and the palette
  shows the hex it has landed on.

- **Duplicating an event is behind a button.** Seven fields for a thing that
  happens once in an event's life, if ever, sat permanently open above Trash.
  The section now expands on request, and says "Duplicate Event/Conf".
- **Form fields in a grid line up.** `FormGrid` bottom-aligned its children, so
  a field without a hint had its input lifted by the height of its neighbour's
  — which is what knocked the room editor's Name and Capacity out of line. It
  aligns tops now; every child is a `Field` whose label is one line, so the
  inputs align and hints hang below. The room card also stacks with `FormStack`
  rather than a run of hand-placed margins.

- **The room panel's create form matches its editor.** Name, capacity and
  colour sit on a grid; the booking permission gets its own line below; the
  button gets its own row. Everything used to share one line, which needed a
  hand-tuned margin on the colour swatch to fake a baseline. The permission
  now reads "Attendees may book this room" in all three places it appears, and
  in the editor it is part of the form — it used to save the instant you
  clicked it, so Cancel could not undo it.

- **The schedule header is sorted by what each control is for.** Pitches moves
  down beside the grid/list switcher and the Now button — it is another way of
  looking at the programme. Calendar export and Subscribe move into the name
  menu and lose their toolbar button; both are personal to you, and the
  subscription link literally is.

- **The identity chip opens a menu, not a modal.** Tapping your name in the
  schedule header used to open a panel that could rename you *and* change your
  role by typing another event password — two consequential changes one stray
  click apart. It is now a two-item dropdown: view/edit your profile, or sign
  out. Your display name moved onto the profile form, beside the profile name
  it was always a separate record from, and roles follow the passwords an
  organiser issues, so changing yours means signing out and entering another.

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

- **A dragged session flashed back to its old slot before landing.** On drop
  the drag state was cleared before the PATCH was even sent, and the block's
  position comes entirely from that state — so it repainted where it started
  for a whole round trip, then jumped forward when the response arrived. The
  block now waits where you dropped it until the server answers, and a
  rejected move snaps back at the moment we learn it failed. A block whose
  save is still in flight can no longer be picked up again, which would have
  raced its own `expectedUpdatedAt`.

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
