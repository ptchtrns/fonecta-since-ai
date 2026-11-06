import { createRouter, intentPreload } from '@solidjs/router';
import { fileRoutes } from '@solidjs/router/fs';
import { pageRoutes } from 'virtual:file-routes';

// Page routes come from src/routes. Hovering a link preloads its code and data.
export const Router = createRouter({
  routes: fileRoutes(pageRoutes),
  preloadLinks: intentPreload(),
});

export const { paths } = Router;
