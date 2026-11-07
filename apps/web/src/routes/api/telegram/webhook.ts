import { json, publicOrigin, type ApiEvent } from '~/server/http';
import { log } from '~/server/log';
import { parseUpdate, validSecret } from '~/server/telegram';
import { receiveTelegram } from '~/services/contact.service';

// Public: the Telegram Bot API calls this with every update, carrying the secret given to setWebhook.
export async function POST(event: ApiEvent) {
  if (!validSecret(event.request.headers.get('x-telegram-bot-api-secret-token'))) {
    log.warn('telegram', 'webhook rejected: invalid secret');
    return json({ message: 'Invalid secret' }, 401);
  }
  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return json({ message: 'Invalid JSON' }, 400);
  }
  const update = parseUpdate(body);
  if (update) {
    log.info('telegram', 'received', { type: update.kind });
    try {
      await receiveTelegram(update, publicOrigin(event.request));
    } catch (error) {
      // Telegram retries anything that isn't a 200, which would repeat the reply.
      log.error('telegram', 'update failed', { error });
    }
  }
  return json({ message: 'ok' });
}
