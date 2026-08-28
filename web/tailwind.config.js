import { fileURLToPath } from 'node:url';

// Globs are resolved against the process CWD, which is the repo root when Vite
// is run from there — anchor them to this file instead.
const here = fileURLToPath(new URL('.', import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [`${here}index.html`, `${here}src/**/*.{ts,tsx}`],
  theme: {
    extend: {
      colors: {
        // Highlighter yellow, reserved for the now-line, the Now button and
        // "now" badges (SPEC §7.7). Never used for ordinary chrome.
        accent: '#FFD84D',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
