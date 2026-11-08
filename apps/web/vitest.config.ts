import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

// Tests cover pure helpers, so they don't need the app's Cloudflare and Solid plugins from vite.config.ts. Server
// modules can be tested with their D1 and Yext dependencies mocked; these aliases let them load at all.
const stubs = fileURLToPath(new URL('./src/test/server-stubs.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': stubs,
      'cloudflare:workers': stubs,
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
