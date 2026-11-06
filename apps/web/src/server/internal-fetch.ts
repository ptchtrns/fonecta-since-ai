import 'server-only';
import { getRequestEvent } from '@solidjs/web';
import { apiHandler } from '~/server/api-handler';

/**
 * Runs an API route in-process during SSR, so pages load data through the same REST
 * handlers the browser uses without a network round trip. Shares the page request's
 * cookies and resolved session.
 */
export function internalFetch(path: string, init?: RequestInit): Promise<Response> {
  const event = getRequestEvent();
  if (!event) throw new Error('internalFetch called outside a request scope');

  const headers = new Headers(init?.headers);
  const cookie = event.request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);

  const apiEvent = {
    request: new Request(new URL(path, event.request.url), { ...init, headers }),
    locals: event.locals,
  };
  return apiHandler(apiEvent, () => Response.json({ message: 'Not found' }, { status: 404 }));
}
