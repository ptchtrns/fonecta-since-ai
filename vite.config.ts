import { defineConfig } from 'vite-plus';

// Workspace-wide lint, format and task settings. App config lives in apps/web/vite.config.ts.
export default defineConfig({
  defaultPackage: './apps/web',
  run: { cache: true },
  fmt: {
    singleQuote: true,
    semi: true,
    printWidth: 110,
    ignorePatterns: [
      '**/worker-configuration.d.ts',
      '**/file-routes.d.ts',
      '**/drizzle/**',
      'apps/worker/**',
      'data/**',
    ],
  },
  lint: {
    plugins: ['typescript'],
    ignorePatterns: [
      '**/worker-configuration.d.ts',
      '**/file-routes.d.ts',
      '**/dist/**',
      'apps/worker/**',
      'data/**',
    ],
  },
});
