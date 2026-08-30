import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const apiTarget = process.env.API_URL ?? 'http://127.0.0.1:3001';

/** Best-effort: the Docker build stage copies source without `.git`. */
function git(command: string): string {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { version: string };

// Env vars win so a build without a git checkout (Docker, a tarball) can still
// be stamped — pass them as build args. Falling back to the package version
// keeps the footer honest rather than blank.
const buildTag = process.env.BUILD_TAG || git('git describe --tags --abbrev=0') || `v${pkg.version}`;
const buildCommit = process.env.BUILD_COMMIT || git('git rev-parse --short HEAD') || 'unknown';
const buildDirty = process.env.BUILD_COMMIT ? false : git('git status --porcelain') !== '';
const buildTime = new Date().toISOString();

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  define: {
    __BUILD_TAG__: JSON.stringify(buildTag),
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
    __BUILD_DIRTY__: JSON.stringify(buildDirty),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../server/src/shared', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 0.0.0.0 so the dev server is reachable from outside the container.
    host: '0.0.0.0',
    // The app answers on 3000 in dev as well as in production; the API sits
    // behind this proxy on 3001 so the two do not fight over the port.
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
        // SSE must not be buffered by the proxy.
        ws: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
