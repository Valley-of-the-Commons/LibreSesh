/**
 * CLI over the demo fixture in server/src/seed.ts.
 *
 *   npm run seed        DemoConf 2026 — two days, the everyday fixture
 *   npm run seed:long   LongConf 2026 — a fortnight, for the long-event cases
 *
 * Unlike the server's boot-time seeding, this *replaces* an existing event of
 * the same slug — that is the point of re-running it during development.
 * Override with SEED_SLUG, SEED_NAME, SEED_DAYS, SEED_START_DATE.
 */
import { loadConfig } from '../server/src/config.js';
import { openDb } from '../server/src/db.js';
import { DEMO_PASSWORDS, seedDemoEvent } from '../server/src/seed.js';

const config = loadConfig();
const db = openDb(config.databasePath);

const result = seedDemoEvent(db, {
  replace: true,
  ...(process.env.SEED_SLUG ? { slug: process.env.SEED_SLUG } : {}),
  ...(process.env.SEED_NAME ? { name: process.env.SEED_NAME } : {}),
  ...(process.env.SEED_DAYS ? { days: Number(process.env.SEED_DAYS) } : {}),
  ...(process.env.SEED_START_DATE ? { startDate: process.env.SEED_START_DATE } : {}),
});

db.close();

// `replace: true` means seedDemoEvent always builds the event, never null.
const { slug, sessionCount, startDate, endDate } = result as NonNullable<typeof result>;
console.log(`Seeded "${slug}" — ${sessionCount} sessions (${startDate} → ${endDate})`);
console.log(`Database: ${config.databasePath}`);
console.log(`Open:     http://localhost:${config.port}/e/${slug}`);
console.log(
  `Passwords: viewer=${DEMO_PASSWORDS.viewer}  user=${DEMO_PASSWORDS.user}  admin=${DEMO_PASSWORDS.admin}`,
);
