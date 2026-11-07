import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

// Tests cover pure helpers, so they don't need the app's Cloudflare and Solid plugins from vite.config.ts.
export default defineConfig({
  resolve: { alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'] },
});
