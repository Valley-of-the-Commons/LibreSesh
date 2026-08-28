import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./server/src/shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // better-sqlite3 is a native addon; forks keep each file's DB isolated.
    pool: 'forks',
    // Hashing dominates the suite otherwise; the algorithm under test is the same.
    env: { BCRYPT_COST: '4' },
  },
});
