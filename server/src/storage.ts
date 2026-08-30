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
import { statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

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

/**
 * Can this process actually create the database at this path?
 *
 * A mounted volume usually arrives owned by root while the app runs
 * unprivileged, and the resulting failure surfaces as `SQLITE_CANTOPEN` from
 * inside better-sqlite3 — a message that says nothing about ownership. Probing
 * with a real file is the honest test; `access(W_OK)` can lie under some
 * container filesystems.
 *
 * The directory may not exist yet (openDb mkdirs it), so the probe walks up to
 * the nearest ancestor that does: being able to write there is what determines
 * whether the rest can be created.
 */
export function isWritableDirectory(directory: string): boolean {
  let target = resolve(directory);
  for (;;) {
    try {
      statSync(target);
      break;
    } catch {
      const parent = dirname(target);
      if (parent === target) return false;
      target = parent;
    }
  }

  const probe = join(target, `.libresesh-write-probe-${process.pid}`);
  try {
    writeFileSync(probe, '');
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}
