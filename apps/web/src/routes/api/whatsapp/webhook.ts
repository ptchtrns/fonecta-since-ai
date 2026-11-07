import { json, publicOrigin, type ApiEvent } from '~/server/http';
import { log, maskPhone } from '~/server/log';
import { parseWebhook, validSignature, verifyToken } from '~/server/whatsapp';
import { receiveWhatsApp } from '~/services/contact.service';

// Public: the WhatsApp Cloud API calls this. GET is Meta's subscription handshake; POST carries owner messages and
// button taps, signed with the app secret.
export function GET(event: ApiEvent) {
  const q = new URL(event.request.url).searchParams;
  const expected = verifyToken();
  if (expected && q.get('hub.mode') === 'subscribe' && q.get('hub.verify_token') === expected) {
    return new Response(q.get('hub.challenge') ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(event: ApiEvent) {
  const raw = await event.request.text();
  if (!(await validSignature(raw, event.request.headers.get('x-hub-signature-256')))) {
    log.warn('whatsapp', 'webhook rejected: invalid signature');
    return json({ message: 'Invalid signature' }, 401);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ message: 'Invalid JSON' }, 400);
  }
  for (const m of parseWebhook(body)) {
    log.info('whatsapp', 'received', { from: maskPhone(m.from), type: m.buttonId ? 'button' : 'text' });
    await receiveWhatsApp(m.from, m.buttonId, publicOrigin(event.request));
  }
  // Meta retries anything that isn't a 200, so unknown senders are acknowledged too.
  return json({ message: 'ok' });
}
