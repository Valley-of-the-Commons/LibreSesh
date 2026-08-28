# Project Status

The shared queue: what is in flight, what is blocked, and what is planned.
Shipped work moves to [CHANGELOG.md](CHANGELOG.md) and is not repeated here.

Last updated: 2026-08-28

## In Progress

_None._

## Blockers

_None_

---

# Backlog

_The only queue of future work, priority-ordered. Top High-Priority item = next up._

## High Priority

- **Profiles: decide what happens to an unclaimed person's name.** Anyone who
  can create a session can create a person by typing a new speaker name. That is
  right for an unconference, but a busy event may want organisers to approve or
  merge duplicates ("A. Lovelace" vs "Ada Lovelace"). No merge tool exists.


## Medium Priority

- **Dependency bumps — all need major upgrades, none currently exploitable here.**
  Assessed 2026-08-28:
  - `vitest` 2.x, *critical* — only reachable when the Vitest **UI server** is
    listening. We never run `vitest --ui`. Fix is vitest@4 (breaking).
  - `vite` 5.x, *high* — `server.fs.deny` bypass **on Windows**. Dev-only, and
    this project builds on Linux. Fix is vite@8 (breaking).
  - `esbuild` (via Vite), *moderate* — any website can call the dev server and
    read the response. Worth knowing because our dev server binds `0.0.0.0`
    for the container; does not affect production, which serves static files.
  - `react-router-dom` 6.x, *moderate* — the one advisory that ships. Open
    redirect via a backslash in `<Link>`/`useNavigate`; the companion SSR
    `deserializeErrors` issue does not apply (no SSR). Every navigation we
    build is prefixed with a literal `/e/`, so a path cannot start `//` or
    `\\`. Fix is react-router-dom@7 (breaking).
- **Manual browser pass.** Automated coverage is server-side; the drag, now-line
  and 360px checks in the plan's verification section still want a human look.
- **Deploy paths are written but unverified.** Neither `docker` nor the
  `sqlite3` CLI exists in this dev container, so `deploy/Dockerfile`,
  `deploy/docker-compose.yml` and `deploy/backup.sh` have never actually been
  run. They follow the spec and standard practice, but treat the first VPS
  deploy as the real test.

## Low Priority / Ideas

- **README screenshot.** Asked for on 2026-08-28 but not possible from the dev
  container — there is no browser and the Playwright/Puppeteer binaries cannot
  be fetched through the firewall. Needs a PNG dropped in by hand.

---

# Out of scope

Deliberately not built, so nobody re-litigates them by accident:

- Session voting, per-room QR codes, email of any kind, multi-language,
  image uploads, WebSockets, and per-user accounts. The last two matter most:
  SSE and shared per-event passwords are load-bearing design choices, not
  placeholders.

Dark mode, iCal export and personal "my agenda" starring were on this list
originally (SPEC §12) and were pulled in deliberately on 2026-08-28.
