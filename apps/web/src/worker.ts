import app from 'virtual:solid-ssr-handler';
import { env } from 'cloudflare:workers';
import { runScheduled } from '~/services/contact.service';

export default {
  fetch(request) {
    return app.fetch(request);
  },
  // Hourly cron trigger from wrangler.jsonc: within each owner's contact window, applies standing permissions
  // and sends their next question. Linked pages are checked once a day.
  scheduled(_controller, _env, ctx) {
    const origin = (env as { APP_URL?: string }).APP_URL;
    if (origin) ctx.waitUntil(runScheduled(origin));
  },
} satisfies ExportedHandler;
