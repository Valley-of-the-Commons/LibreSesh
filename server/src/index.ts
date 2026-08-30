import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { DEMO_PASSWORDS, seedDemoEvent } from './seed.js';
import { checkDurableStorage, ephemeralStorageMessage } from './storage.js';

const config = loadConfig();

// Before openDb, which would otherwise mkdir the directory and make an
// unmounted path indistinguishable from a mounted one.
if (!config.allowEphemeralDb && config.databasePath !== ':memory:') {
  const { durable, directory } = checkDurableStorage(config.databasePath);
  if (!durable) {
    console.error(ephemeralStorageMessage(directory));
    process.exit(1);
  }
}

const db = openDb(config.databasePath);

// Only ever creates the event when it is absent — never replaces one — so a
// redeploy cannot wipe what people added to the demo, and deleting it in the
// admin UI is not undone on the next restart.
if (config.seedDemoEvent) {
  const seeded = seedDemoEvent(db);
  if (seeded) {
    console.log(
      `seeded the demo event "${seeded.slug}" (${seeded.sessionCount} sessions). ` +
        `Passwords: viewer=${DEMO_PASSWORDS.viewer} user=${DEMO_PASSWORDS.user} ` +
        `admin=${DEMO_PASSWORDS.admin}. Set SEED_DEMO_EVENT=0 to stop creating it.`,
    );
  }
}

const { express: app, ctx } = createApp(db, config);

// 0.0.0.0 so the port is reachable from outside a container.
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`libresesh listening on http://0.0.0.0:${config.port}`);
  console.log(`database: ${config.databasePath}`);
  if (config.demoMode) {
    // Loud on purpose: every event on this instance is open to anyone who can
    // reach it, at whatever role they pick.
    console.warn(
      'WARNING: DEMO_MODE is on. Event passwords are NOT checked — anyone can ' +
        'take any role, including admin. Never set this on a real instance.',
    );
  }
});

// SSE clients hold sockets open; give them a chance to close cleanly.
server.headersTimeout = 0;
server.requestTimeout = 0;

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  ctx.broker.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
