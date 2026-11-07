import 'server-only';
import { env } from 'cloudflare:workers';
import { levelFor, log } from '~/server/log';

// Writes changes to Yext, which syndicates them to Google, Apple Maps, Bing and the rest. YEXT_API_URL is the
// dataset's mock (http://localhost:8787, see its mock_api) or the sandbox (https://sbx-api.yextapis.com). Without
// it a change is only saved here, and the UI says so instead of claiming it went live.

type Env = { YEXT_API_URL?: string; YEXT_API_KEY?: string };
const VERSION = '20261106';

export const yextEnabled = () => !!(env as Env).YEXT_API_URL;

export type YextResult = { sent: boolean; error?: string };

export async function putEntity(entityId: string, body: Record<string, unknown>): Promise<YextResult> {
  const { YEXT_API_URL, YEXT_API_KEY = 'demo' } = env as Env;
  if (!YEXT_API_URL) return { sent: false };
  const url = `${YEXT_API_URL.replace(/\/$/, '')}/v2/accounts/me/entities/${encodeURIComponent(entityId)}?v=${VERSION}`;
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'api-key': YEXT_API_KEY },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as {
      meta?: { errors?: { message: string }[] };
    };
    log[levelFor(response.status)]('yext', `PUT entity ${response.status}`, { entity: entityId });
    if (!response.ok)
      return { sent: false, error: result.meta?.errors?.[0]?.message ?? `HTTP ${response.status}` };
    return { sent: true };
  } catch (error) {
    log.error('yext', 'PUT entity failed', { entity: entityId, error });
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}
