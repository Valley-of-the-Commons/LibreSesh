import type { Config } from './config.js';
import type { Db } from './db.js';
import type { RateLimiter } from './ratelimit.js';
import type { Broker } from './sse.js';

/** Everything a route module needs. Handlers stay synchronous: better-sqlite3
 *  and bcryptjs are both sync, so Express 4 propagates thrown errors for us. */
export interface Ctx {
  db: Db;
  broker: Broker;
  limiter: RateLimiter;
  config: Config;
}
