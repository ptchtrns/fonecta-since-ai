import app from 'virtual:solid-ssr-handler';
import { env } from 'cloudflare:workers';
import { runNightly } from '~/services/contact.service';

export default {
  fetch(request) {
    return app.fetch(request);
  },
  // Cron trigger from wrangler.jsonc: applies standing permissions and sends each owner their next question.
  scheduled(_controller, _env, ctx) {
    const origin = (env as { APP_URL?: string }).APP_URL;
    if (origin) ctx.waitUntil(runNightly(origin));
  },
} satisfies ExportedHandler;
