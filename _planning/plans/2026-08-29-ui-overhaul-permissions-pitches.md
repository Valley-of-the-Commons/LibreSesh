# UI overhaul, permissions, pitch voting, livestream

Started 2026-08-29. Sequenced so each file is touched once; each numbered
milestone is one commit (commit policy: milestones).

## M1 — UI primitives

- [ ] `ui.tsx`: kill the `mb-3` alignment hack. `Field` currently owns its own
      bottom margin, so callers hardcode `mb-3` on buttons to line up — breaks
      whenever a field has a `hint`. Move spacing to a `FormRow`/`FormGrid`
      container using `items-end` + `gap`.
- [ ] Add `TextLink` (no permanent underline; colour + hover underline).
- [ ] Add `DangerButton` — "delete" is currently a red underlined text link.
- [ ] Add `IconButton` for the room reorder arrows.
- [ ] Add `Section`/`Card` to replace the repeated
      `rounded-2xl border ... p-5 shadow-sm` string.
- [ ] Add `Toggle` for the open-track / permission checkboxes.

## M2 — Admin panel + room editing

- [ ] Rooms: expose **capacity** (read-only `<span>` today) and **description**
      (not exposed at all). Server `PATCH /rooms/:id` already accepts both.
- [ ] Replace invisible blur-to-save with an explicit edit affordance.
- [ ] Apply new primitives across AdminPage; remove every `underline`.

## M2b — Rooms vs tracks — DROPPED 2026-08-30

Descoped at the user's call: not a work item. Rewritten as a tiered backlog
entry in STATUS.md ("Grid columns read as tracks, not rooms"), where the cheap
relabel is separated from the speculative track feature.

## M3 — Permissions matrix (server)

- [ ] Migration `006_permissions.sql` → `event_permissions(event_id, capability,
      role, allowed)`. Store overrides only; defaults live in code so adding a
      capability later needs no data migration.
- [ ] `server/src/permissions.ts`: canonical capability list + defaults,
      `getPermissions`, `can`, `requireCapability` middleware.
- [ ] 9 capabilities: contribute.create, contribute.delete_own,
      contribute.moderate, session.create_open, session.edit_own,
      proposal.create, proposal.vote, star, person.edit_own.
- [ ] **Admin column locked on** — unchecking admin for `contribute.moderate`
      yields an event nobody can moderate or recover.
- [ ] Swap `requireRole` for `requireCapability` at the gated call sites.
- [ ] `PATCH /permissions` (admin only) + `permissions.updated` SSE type.
- [ ] `tests/permissions.test.ts`.

## M4 — Permissions matrix (client)

- [ ] Matrix in the bundle DTO; `can()` helper.
- [ ] Admin UI section; gate the affected controls app-wide.

## M5 — Pitch system

- [ ] Always show the creator on a pitch card (DTO already has
      `createdByName`).
- [ ] Creator defaults to host/speaker on the pitch.
- [ ] **Up/down votes replace interest** (ASSUMPTION — flagged to user):
      `proposal_interest` → `proposal_votes` with `value` +1/-1; existing rows
      migrate to +1. `interestCount` → `score`/`upvotes`/`downvotes`.
- [ ] Hot / New sort division on the proposal board.
- [ ] Update `proposals.test.ts`.

## M6 — Session livestream field

- [ ] Migration: `sessions.livestream_url TEXT NOT NULL DEFAULT ''`.
- [ ] Validation reuses the existing http/https URL restriction.
- [ ] Editable in SessionModal; surfaced in DetailSheet.

## M7 — Whole-app UI sweep

- [ ] SchedulePage (989 lines), Calendar, DetailSheet, ProposalBoard,
      ProfilePage, Gate, modals, EventListPage, NewEventPage, IdentityPanel.

## M8 — Docs

- [ ] ARCHITECTURE.md §Realtime: add a **Concurrency** paragraph. It documents
      broadcast and heartbeats but never states the model — last-write-wins,
      `assertNotStale` 409 on `updated_at` mismatch, and no CRDT by design
      (SPEC non-goal).
