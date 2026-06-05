import { defineConfig } from 'vite';

// Keep the dev server from watching/reloading on build output and brainstorm
// artifacts (e.g. `release/` from electron-builder, `dist/` from vite build).
export default defineConfig({
  // Electron loads dist/index.html over file://, so assets must be referenced
  // relatively (./assets/...) — the default '/' resolves to the filesystem root
  // and 404s, leaving the UI unstyled. See main.js window.loadFile().
  base: './',
  server: {
    watch: {
      ignored: ['**/release/**', '**/dist/**', '**/.superpowers/**'],
    },
  },
});
