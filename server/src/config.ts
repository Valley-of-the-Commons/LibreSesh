import { randomBytes } from 'node:crypto';
import { DEMO_SLUG, LONG_DEMO } from './seed.js';

export interface Config {
  port: number;
  databasePath: string;
  cookieSecret: string;
  instanceAdminPassword: string;
  trustProxy: boolean;
  /** Serve web/dist and fall back to index.html (production single-process mode). */
  serveStatic: boolean;
  /**
   * Public-demo instance: the gate hands out roles on a click instead of
   * checking a password. Deliberately an env var and not a per-event column —
   * a column is data, so it would survive a clone and could be toggled on a
   * real event by mistake. This can only be set by whoever deploys.
   */
  demoMode: boolean;
  /**
   * Which events the open gate actually applies to. Demo mode used to be
   * instance-wide, which meant a real event created on a demo instance — to
   * try the product, or because someone had a conference to run — was silently
   * open to anyone at any role, including organiser. The free-for-all belongs
   * to the seeded fixtures and nothing else, so it is a list, and everything
   * not on it checks passwords as usual. Empty unless `DEMO_MODE` is on.
   */
  demoEventSlugs: string[];
  /**
   * Seed the DemoConf fixture at boot if it is missing. On by default so a
   * fresh instance has something to look at; set SEED_DEMO_EVENT=0 on a real
   * conference instance, where a fake event on the landing page is noise.
   */
  seedDemoEvent: boolean;
  /**
   * Permission to run with a database that will not survive a redeploy. Off by
   * default in production, where an unmounted data directory is nearly always
   * a forgotten volume rather than a decision.
   */
  allowEphemeralDb: boolean;
}

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required env var ${name}`);
  }
  return v;
}

/** Overridable for an instance that seeds its own fixture under other slugs. */
function demoEventSlugs(): string[] {
  const configured = (process.env.DEMO_EVENT_SLUGS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : [DEMO_SLUG, LONG_DEMO.slug];
}

/** Whether *this* event's gate is a role picker. Never true off a demo
 *  instance, and never true for an event someone created themselves. */
export function isDemoEvent(config: Config, slug: string): boolean {
  return config.demoMode && config.demoEventSlugs.includes(slug);
}

export function loadConfig(): Config {
  const isProd = process.env.NODE_ENV === 'production';
  const isDemo = process.env.DEMO_MODE === '1';

  // A generated secret is fine for local dev (it only invalidates cookies on
  // restart); in production an explicit one is required so identities survive
  // a redeploy.
  const cookieSecret = isProd
    ? required('COOKIE_SECRET')
    : (process.env.COOKIE_SECRET ?? randomBytes(32).toString('hex'));

  return {
    port: Number(process.env.PORT ?? 3000),
    databasePath: process.env.DATABASE_PATH ?? 'data/app.db',
    cookieSecret,
    instanceAdminPassword: isProd
      ? required('INSTANCE_ADMIN_PASSWORD')
      : (process.env.INSTANCE_ADMIN_PASSWORD ?? 'dev-instance-password'),
    trustProxy: process.env.TRUST_PROXY === '1',
    serveStatic: process.env.SERVE_STATIC === '1' || isProd,
    demoMode: isDemo,
    demoEventSlugs: isDemo ? demoEventSlugs() : [],
    seedDemoEvent: process.env.SEED_DEMO_EVENT !== '0',
    allowEphemeralDb: !isProd || process.env.ALLOW_EPHEMERAL_DB === '1',
  };
}
