import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { openDb } from './db.js';

const config = loadConfig();
const db = openDb(config.databasePath);
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
