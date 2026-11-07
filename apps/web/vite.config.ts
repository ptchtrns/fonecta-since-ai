import { cloudflare } from '@cloudflare/vite-plugin';
import solid from '@solidjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { fileRoutes } from 'filesystem-routing/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite-plus';

export default defineConfig({
  plugins: [
    solid({
      start: { middleware: './src/middleware.ts' },
      ssr: true,
      extensions: ['.jsx', '.tsx'],
    }),
    fileRoutes({ httpMethods: true, types: true }),
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    ssrFullReload(),
  ],
  // Solid's buildApp hook builds the client first, Cloudflare's post hook then builds the worker.
  // A no-op here stops Cloudflare's default orchestration from building the client a second time.
  builder: { buildApp: async () => {} },
  resolve: { alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) } },
  environments: {
    ssr: {
      // The worker entry only imports a virtual module, so the dep scanner finds nothing up front.
      // Late discovery re-bundles deps under a running workerd and breaks dev SSR. Add server-side
      // packages here when you install them. Packages with a `solid` export condition stay out.
      optimizeDeps: {
        include: [
          'solid-js',
          '@solidjs/web',
          '@solidjs/web/storage',
          '@solidjs/router/fs',
          '@solidjs/meta',
          'filesystem-routing/api',
          'better-auth',
          'better-auth/adapters/drizzle',
          'better-auth/api',
          'better-auth/client',
          'drizzle-orm',
          'drizzle-orm/d1',
          'drizzle-orm/sqlite-core',
          'zod',
        ],
      },
    },
  },
  server: { port: 3000, allowedHosts: ['concise-holy-mallard.ngrok-free.app'] },
  build: { target: 'esnext' },
});

/**
 * Dev only: re-evaluates the whole server graph inside workerd after any edit. Route components
 * are cached by lazy() once loaded, so module-level HMR would keep serving stale SSR markup.
 */
function ssrFullReload(): Plugin {
  return {
    name: 'ssr-full-reload',
    apply: 'serve',
    hotUpdate() {
      if (this.environment.name !== 'ssr') return;
      this.environment.moduleGraph.invalidateAll();
      this.environment.hot.send({ type: 'full-reload' });
      return [];
    },
  };
}
