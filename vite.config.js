import { defineConfig } from 'vite';

// Keep the dev server from watching/reloading on build output and brainstorm
// artifacts (e.g. `release/` from electron-builder, `dist/` from vite build).
export default defineConfig({
  server: {
    watch: {
      ignored: ['**/release/**', '**/dist/**', '**/.superpowers/**'],
    },
  },
});
