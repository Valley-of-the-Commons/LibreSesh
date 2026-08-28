import { randomBytes } from 'node:crypto';

export interface Config {
  port: number;
  databasePath: string;
  cookieSecret: string;
  instanceAdminPassword: string;
  trustProxy: boolean;
  /** Serve web/dist and fall back to index.html (production single-process mode). */
  serveStatic: boolean;
}

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required env var ${name}`);
  }
  return v;
}

export function loadConfig(): Config {
  const isProd = process.env.NODE_ENV === 'production';

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
  };
}
