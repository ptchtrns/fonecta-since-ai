import 'server-only';
import type { ContactChannel } from '~/db/schema';
import { json } from '~/server/http';

const names: Record<ContactChannel, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  TELEGRAM: 'Telegram',
  SMS: 'Text message',
  APP_PUSH: 'App notification',
};

type Failure = { reason: string; message?: string };

/** The answer to saving a channel: saved, and whether the first suggestion went out on it. */
export function savedReply(channel: ContactChannel, result: { sent: boolean; failure?: Failure }) {
  const name = names[channel];
  const { failure } = result;
  if (failure?.reason === 'SendFailed')
    return json({ message: `Saved, but ${name} didn't send it: ${failure.message}` }, 502);
  if (failure?.reason === 'NotConfigured')
    return json({ message: `Saved. ${name} sending isn't set up yet.` });
  if (result.sent)
    return json({ message: `Saved. Your most important suggestion is on its way to ${name}.` });
  return json({ message: 'Saved.' });
}

/** The answer to a test message. */
export function testReply(channel: ContactChannel, error: Failure | null, sent: string) {
  const name = names[channel];
  if (!error) return json({ message: sent });
  switch (error.reason) {
    case 'NoAddress':
      return json(
        { message: channel === 'TELEGRAM' ? 'Connect Telegram first' : `Save your ${name} address first` },
        400,
      );
    case 'NotConfigured':
      return json({ message: `${name} sending is not set up yet` }, 503);
    default:
      return json({ message: `${name} didn't send it: ${error.message}` }, 502);
  }
}
