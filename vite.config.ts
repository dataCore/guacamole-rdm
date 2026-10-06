/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Dev only: the Guacamole backend from deploy/dev/docker-compose.yml, at its default
// context /guacamole/ like in production. There, SPA and Guacamole share one
// origin behind the reverse proxy, so nothing is proxied.
const guacamole = process.env.GUACAMOLE_DEV_URL ?? 'http://127.0.0.1:18080';

export default defineConfig({
  plugins: [svelte()],
  // Relative asset URLs: the same build works at / or under any prefix.
  base: './',
  build: {
    target: 'es2022',
    // Inlined assets would need data: in the CSP; emit them as files instead.
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/guacamole': { target: guacamole, ws: true },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
