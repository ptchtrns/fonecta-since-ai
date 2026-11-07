import 'server-only';
import { env } from 'cloudflare:workers';
import { log, maskPhone } from '~/server/log';

// Sends owner messages through the WhatsApp Cloud API.
//
// WhatsApp lets a business start a conversation only with an approved template. The first message about a
// suggestion therefore uses WHATSAPP_TEMPLATE (one body variable, three quick-reply buttons); replies within 24
// hours of the owner's last message are free-form, with reply buttons.

type Env = {
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_TEMPLATE?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
};
const config = () => env as Env;
const GRAPH = 'https://graph.facebook.com/v25.0';

export const whatsappEnabled = () => !!(config().WHATSAPP_TOKEN && config().WHATSAPP_PHONE_NUMBER_ID);
export const verifyToken = () => config().WHATSAPP_VERIFY_TOKEN;

export type Outgoing = {
  to: string;
  body: string;
  language: string;
  /** Button titles; ids are `${action}:${token}` so a tap answers the right suggestion. */
  buttons?: { id: string; title: string }[];
  /** Outside the 24-hour window: must go out as a template. */
  startsConversation?: boolean;
};

export type SendResult = { id: string | null; error?: string };

async function post(to: string, payload: Record<string, unknown>): Promise<SendResult> {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = config();
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) return { id: null, error: 'WhatsApp is not configured' };
  const number = to.replace(/\D/g, '');
  try {
    const response = await fetch(`${GRAPH}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: number, ...payload }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message: string };
    };
    if (!response.ok) {
      log.error('whatsapp', 'send failed', { to: maskPhone(number), status: response.status });
      return { id: null, error: result.error?.message ?? `HTTP ${response.status}` };
    }
    log.info('whatsapp', 'sent', { to: maskPhone(number), id: result.messages?.[0]?.id });
    return { id: result.messages?.[0]?.id ?? null };
  } catch (error) {
    log.error('whatsapp', 'send failed', { to: maskPhone(number), error });
    return { id: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export function sendWhatsApp(message: Outgoing): Promise<SendResult> {
  const buttons = (message.buttons ?? []).slice(0, 3);
  const template = config().WHATSAPP_TEMPLATE;
  if (message.startsConversation && template) {
    return post(message.to, {
      type: 'template',
      template: {
        name: template,
        language: { code: message.language },
        components: [
          // Template variables can't hold line breaks.
          { type: 'body', parameters: [{ type: 'text', text: message.body.replace(/\s*\n+\s*/g, ' · ') }] },
          ...buttons.map((b, i) => ({
            type: 'button',
            sub_type: 'quick_reply',
            index: String(i),
            parameters: [{ type: 'payload', payload: b.id }],
          })),
        ],
      },
    });
  }
  if (buttons.length) {
    return post(message.to, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: message.body.slice(0, 1024) },
        action: {
          buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })),
        },
      },
    });
  }
  return post(message.to, { type: 'text', text: { body: message.body } });
}

/**
 * Sends Meta's pre-approved hello_world template. It's the one message a test number can always send, and the
 * owner's reply opens the 24-hour window in which suggestions can go out as normal messages with buttons.
 */
export const sendTestTemplate = (to: string) =>
  post(to, { type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } });

/** Checks Meta's X-Hub-Signature-256 header: HMAC-SHA256 of the raw body with the app secret. */
export async function validSignature(raw: string, header: string | null): Promise<boolean> {
  const secret = config().WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  const given = header.slice(7);
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export type Incoming = { from: string; text: string; buttonId?: string };

/** Pulls owner messages out of a WhatsApp webhook payload: text, button taps and template quick replies. */
export function parseWebhook(body: unknown): Incoming[] {
  type Msg = {
    from: string;
    type: string;
    text?: { body: string };
    button?: { text: string; payload: string };
    interactive?: { button_reply?: { id: string; title: string } };
  };
  const entries = (body as { entry?: { changes?: { value?: { messages?: Msg[] } }[] }[] })?.entry ?? [];
  const out: Incoming[] = [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        if (m.type === 'text' && m.text) out.push({ from: m.from, text: m.text.body });
        else if (m.type === 'button' && m.button)
          out.push({ from: m.from, text: m.button.text, buttonId: m.button.payload });
        else if (m.type === 'interactive' && m.interactive?.button_reply)
          out.push({
            from: m.from,
            text: m.interactive.button_reply.title,
            buttonId: m.interactive.button_reply.id,
          });
      }
    }
  }
  return out;
}
