/**
 * Is the database actually going to survive a redeploy?
 *
 * Nothing in the normal path answers that. `openDb` mkdirs the directory it is
 * pointed at, so a container with no volume attached gets a perfectly working
 * `/data` inside its own filesystem: SQLite writes to it, migrations run, the
 * demo event is seeded, every log line looks healthy — and the whole thing is
 * discarded on the next build. The first symptom is a conference's schedule
 * vanishing, which is far too late to find out.
 *
 * A mounted volume lives on a different device than the root filesystem, so
 * comparing `st_dev` against the parent directory tells us whether the path is
 * a mount point. That is a Unix-wide property, not a Railway one, so this
 * catches the same mistake on any host.
 */
import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** True when `path` sits on a different filesystem than its parent — i.e. something is mounted there. */
export function isMountPoint(path: string): boolean {
  const target = resolve(path);
  const parent = dirname(target);
  if (parent === target) return true; // `/` itself
  try {
    return statSync(target).dev !== statSync(parent).dev;
  } catch {
    // Not there yet (openDb creates it) — so nothing is mounted on it.
    return false;
  }
}

export interface DurabilityCheck {
  durable: boolean;
  directory: string;
}

export function checkDurableStorage(databasePath: string): DurabilityCheck {
  const directory = resolve(dirname(databasePath));
  return { durable: isMountPoint(directory), directory };
}

export function ephemeralStorageMessage(directory: string): string {
  return [
    `Refusing to start: ${directory} is not a mounted volume, so the database`,
    'would live inside this container and be destroyed on the next deploy.',
    '',
    'Attach a volume mounted at that path (on Railway: the service’s Volumes',
    'tab; with Docker Compose: the `./data:/data` bind in deploy/docker-compose.yml),',
    'or point DATABASE_PATH at one that is already mounted.',
    '',
    'If this instance is meant to be disposable — a demo or a preview build —',
    'set ALLOW_EPHEMERAL_DB=1 to say so deliberately.',
  ].join('\n');
}
