import 'server-only';
import { env } from 'cloudflare:workers';
import { log } from '~/server/log';

// Sends owner email through Resend's REST API (https://resend.com/docs/api-reference/emails/send-email).
// RESEND_FROM must be on a domain verified in Resend. Without one, Resend's `onboarding@resend.dev` sender only
// delivers to the Resend account's own address, which is enough to try it out.

type Env = { RESEND_API_KEY?: string; RESEND_FROM?: string };
const config = () => env as Env;

export const emailEnabled = () => !!(config().RESEND_API_KEY && config().RESEND_FROM);

export type Email = { to: string; subject: string; text: string; html: string };
export type SendResult = { id: string | null; error?: string };

/** "owner@example.com" as "o***@example.com", for logs. */
export const maskEmail = (address: string) => address.replace(/^(.).*(@.*)$/, '$1***$2');

export async function sendEmail(email: Email): Promise<SendResult> {
  const { RESEND_API_KEY, RESEND_FROM } = config();
  if (!RESEND_API_KEY || !RESEND_FROM) return { id: null, error: 'Email is not configured' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) {
      log.error('email', 'send failed', { to: maskEmail(email.to), status: response.status });
      return { id: null, error: result.message ?? `HTTP ${response.status}` };
    }
    log.info('email', 'sent', { to: maskEmail(email.to), id: result.id });
    return { id: result.id ?? null };
  } catch (error) {
    log.error('email', 'send failed', { to: maskEmail(email.to), error });
    return { id: null, error: error instanceof Error ? error.message : String(error) };
  }
}
