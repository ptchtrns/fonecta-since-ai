import 'server-only';
import { env } from 'cloudflare:workers';
import { toHtml } from '~/lib/rich-text';
import { log } from '~/server/log';

// Sends owner messages through the Telegram Bot API (https://core.telegram.org/bots/api).
//
// A bot can only write to someone who has started a chat with it, so the owner connects from the Connections page:
// the link opens the bot with `/start <token>`, and the webhook swaps the token for the chat id. Suggestions go out
// with inline buttons; a tap arrives at the webhook as a callback query carrying `${action}:${token}`.

type Env = { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_BOT_USERNAME?: string; TELEGRAM_WEBHOOK_SECRET?: string };
const config = () => env as Env;

export const telegramEnabled = () => !!(config().TELEGRAM_BOT_TOKEN && config().TELEGRAM_BOT_USERNAME);

/** The link that opens the bot and sends `/start <token>`. */
export const startLink = (token: string) =>
  `https://t.me/${config().TELEGRAM_BOT_USERNAME!.replace(/^@/, '')}?start=${token}`;

export type Button = { id: string; title: string; url?: string };
export type SendResult = { id: number | null; error?: string };

async function call<T>(method: string, payload: Record<string, unknown>) {
  const { TELEGRAM_BOT_TOKEN } = config();
  if (!TELEGRAM_BOT_TOKEN) return { ok: false as const, error: 'Telegram is not configured' };
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      result?: T;
      description?: string;
    };
    if (!body.ok) {
      log.error('telegram', `${method} failed`, { status: response.status });
      return { ok: false as const, error: body.description ?? `HTTP ${response.status}` };
    }
    return { ok: true as const, result: body.result as T };
  } catch (error) {
    log.error('telegram', `${method} failed`, { error });
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * One message, with WhatsApp-style *bold* turned into HTML. Buttons with a URL open it; the others send their id
 * back as a callback. Telegram only accepts public https URLs on buttons, so a local link stays a callback.
 */
export async function sendTelegram(
  chatId: string,
  body: string,
  buttons: Button[] = [],
): Promise<SendResult> {
  const keyboard = buttons.map((b) =>
    b.url?.startsWith('https://') ? { text: b.title, url: b.url } : { text: b.title, callback_data: b.id },
  );
  const result = await call<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text: toHtml(body),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(keyboard.length ? { reply_markup: { inline_keyboard: keyboard.map((k) => [k]) } } : {}),
  });
  if (!result.ok) return { id: null, error: result.error };
  log.info('telegram', 'sent', { id: result.result.message_id });
  return { id: result.result.message_id };
}

/** Stops the spinner on a tapped button. */
export const answerCallback = (id: string) => call('answerCallbackQuery', { callback_query_id: id });

/** Takes the buttons off a message once it's answered, so it can't be answered twice. */
export const clearButtons = (chatId: string, messageId: number) =>
  call('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  });

/** Telegram sends the secret given to setWebhook in this header with every update. */
export function validSecret(header: string | null): boolean {
  const expected = config().TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !header || header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export type Update =
  | { kind: 'start'; chatId: string; name: string; token: string }
  | { kind: 'text'; chatId: string }
  | { kind: 'button'; chatId: string; callbackId: string; messageId: number | null; data: string };

/** What an owner did, from a webhook update: started the bot with a token, wrote something, or tapped a button. */
export function parseUpdate(body: unknown): Update | null {
  type From = { username?: string; first_name?: string };
  const update = body as {
    message?: { chat?: { id: number }; from?: From; text?: string };
    callback_query?: { id: string; data?: string; message?: { chat?: { id: number }; message_id: number } };
  };
  const query = update?.callback_query;
  if (query?.message?.chat) {
    return {
      kind: 'button',
      chatId: String(query.message.chat.id),
      callbackId: query.id,
      messageId: query.message.message_id ?? null,
      data: query.data ?? '',
    };
  }
  const message = update?.message;
  if (!message?.chat) return null;
  const chatId = String(message.chat.id);
  const start = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{16,64})$/.exec(message.text?.trim() ?? '');
  if (start) {
    const from = message.from;
    const name = from?.username ? `@${from.username}` : (from?.first_name ?? 'Telegram');
    return { kind: 'start', chatId, name, token: start[1]! };
  }
  return { kind: 'text', chatId };
}
