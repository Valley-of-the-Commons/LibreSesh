# commons-schedule — OpenGrid

A simple, open-source scheduling tool for conferences and unconferences.

Attendees read a live schedule, add notes, links and questions to sessions, and
propose their own sessions in open tracks. Organisers arrange everything by drag
and drop. Changes reach every open browser in under a second.

Three design pillars:

1. **No accounts.** Your identity is an anonymous browser cookie with a display
   name you can change. Access is three shared per-event passwords —
   viewer, user, admin.
2. **One process, one file.** Node + SQLite + Server-Sent Events. Deploys onto a
   1 vCPU VPS and backs up with a single `sqlite3` command.
3. **Mobile-first.** The schedule has to be readable on a phone in a hallway.

## Tech stack

| Layer     | Choice                                                       |
| --------- | ------------------------------------------------------------ |
| Runtime   | Node.js ≥ 20, TypeScript throughout                          |
| Server    | Express, `better-sqlite3` (WAL, no ORM), plain SQL            |
| Realtime  | Server-Sent Events, one stream per event                     |
| Frontend  | Vite + React 18 + Tailwind, React Router                      |
| Auth      | Signed httpOnly cookie, bcrypt-hashed event passwords         |
| Tests     | Vitest + supertest                                            |

## Layout

```
server/            Express app, DB layer, SSE, auth, rate limiting
  migrations/      numbered .sql files, applied at boot
  src/shared/      types + timezone helpers, imported by the web app too
web/               Vite React app
scripts/           seed.ts, create-event.ts
tests/             Vitest suites
deploy/            Dockerfile, compose, Caddyfile, systemd unit, backup script
design/mockup.jsx  approved UI reference — never imported
```

## Setup

```sh
npm install
npm run seed     # creates the "DemoConf 2026" demo event
npm run dev      # API on :3000, Vite on :5173 (proxying /api)
```

Open <http://localhost:5173>. The demo passwords are `viewer2026`, `user2026`
and `admin2026`; the instance password defaults to `dev-instance-password`.

### Native module note

`better-sqlite3` is a native addon. This repo sets `ignore-scripts=true` in
`.npmrc`, so `npm install` will not build it. If `require('better-sqlite3')`
fails with "Could not locate the bindings file", build it once:

```sh
npm run rebuild:native
```

In Docker the build stage passes `--ignore-scripts=false`, so this is handled.

## Commands

| Command                 | What it does                                        |
| ----------------------- | --------------------------------------------------- |
| `npm run dev`           | API + Vite dev server together                      |
| `npm run build`         | Compiles the server and builds `web/dist`           |
| `npm start`             | Runs the built server (serves `web/dist` too)       |
| `npm run seed`          | Recreates the demo event                            |
| `npm run create-event`  | Interactive CLI to create a real event              |
| `npm test`              | Vitest suite                                        |
| `npm run lint`          | ESLint + both TypeScript projects                   |
| `npm run rebuild:native`| Rebuilds `better-sqlite3` against the local Node     |

## Roles

Each event has three shared passwords. Entering a higher one upgrades your role;
entering a lower one downgrades it.

| Capability                                        | viewer | user | admin |
| ------------------------------------------------- | :----: | :--: | :---: |
| View the schedule and contributions                |   ✓    |  ✓   |   ✓   |
| Rename yourself                                    |   ✓    |  ✓   |   ✓   |
| Add notes, links, questions                        |        |  ✓   |   ✓   |
| Create and edit your own sessions in open tracks   |        |  ✓   |   ✓   |
| Full CRUD on sessions, rooms, tags; moderation     |        |      |   ✓   |
| Change passwords, edit settings, archive           |        |      |   ✓   |

Viewing an event requires the viewer password — schedules are never public.

## Configuration

| Variable                  | Default          | Notes                                              |
| ------------------------- | ---------------- | -------------------------------------------------- |
| `PORT`                    | `3000`           |                                                    |
| `DATABASE_PATH`           | `data/app.db`    | `-wal`/`-shm` sidecars sit next to it              |
| `COOKIE_SECRET`           | random in dev    | **Required in production**; changing it logs everyone out |
| `INSTANCE_ADMIN_PASSWORD` | dev placeholder  | **Required in production**; gates event creation   |
| `TRUST_PROXY`             | off              | Set `1` behind Caddy so rate limits see real IPs   |
| `SERVE_STATIC`            | on in production | Serves `web/dist` from the API process             |

## Deployment

```
Caddy (:443, automatic HTTPS)
  └── reverse_proxy localhost:3000
        └── Node process (API + SSE + web/dist)
              └── $DATABASE_PATH  (one SQLite file, WAL mode)
```

SQLite runs **inside** the Node process — there is no database server, port or
connection string. Exactly one app process may own the file; never run two
instances against the same one.

A 1 vCPU / 1 GB VPS is plenty. Hundreds of concurrent SSE clients are idle
sockets, and peak write volume at a conference is a few requests a second. Add
swap as a safety net and keep a few GB of disk free.

### Docker Compose (also the local prod simulation)

```sh
cd deploy
cp opengrid.env.example .env    # set COOKIE_SECRET, INSTANCE_ADMIN_PASSWORD, SITE_ADDRESS
docker compose up --build
```

The DB lives in `deploy/data/`, mounted into the container, so it survives
rebuilds. On the VPS the only change is `SITE_ADDRESS`.

### systemd

```sh
sudo useradd --system --home /srv/opengrid opengrid
sudo rsync -a --exclude node_modules ./ /srv/opengrid/
cd /srv/opengrid && sudo -u opengrid npm ci --ignore-scripts=false && sudo -u opengrid npm run build

sudo cp deploy/opengrid.service /etc/systemd/system/
sudo cp deploy/opengrid.env.example /etc/opengrid.env   # then edit it
sudo systemctl enable --now opengrid
```

Install Caddy from its own package and point it at `localhost:3000`. Keep the
proxy's read/write timeouts above the 25-second SSE heartbeat (≥ 120s) or
streams get cut.

### Backups

`VACUUM INTO` is safe against a live WAL database:

```sh
sqlite3 "$DATABASE_PATH" "VACUUM INTO '/backups/app-$(date +%F).db'"
```

`deploy/backup.sh` wraps that with 14-day retention — run it nightly from cron:

```
0 3 * * *  /srv/opengrid/deploy/backup.sh >> /var/log/opengrid-backup.log 2>&1
```

For continuous replication instead of nightly snapshots, add
[Litestream](https://litestream.io) — one extra binary streaming the WAL to
S3-compatible storage, no code changes.

## Not in v1

Dark mode, iCal export, personal "my agenda" starring, session voting, per-room
QR codes, email, multi-language, image uploads, WebSockets, and per-user
accounts are all deliberately out of scope.

## License

MIT — see [LICENSE](LICENSE).
