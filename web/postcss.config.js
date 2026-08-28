import { fileURLToPath } from 'node:url';

// Vite runs from the repo root, where Tailwind would not find web/tailwind.config.js
// on its own — name it explicitly.
export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) },
    autoprefixer: {},
  },
};
