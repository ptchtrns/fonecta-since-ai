import type { ApiEvent } from '~/server/http';
import { getFile } from '~/services/uploads.service';

// Public by design: keys contain a random UUID, so <img> tags work without auth.
export async function GET(event: ApiEvent) {
  const key = event.params.key;
  if (!key) return new Response('Not found', { status: 404 });

  const [error, object] = await getFile(key, event.request);
  if (error) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  // R2 returns metadata without a body when a conditional header matched.
  if (!('body' in object)) return new Response(null, { status: 304, headers });

  if (object.range && 'offset' in object.range) {
    const { offset = 0, length = object.size - offset } = object.range;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    return new Response(object.body, { status: 206, headers });
  }

  return new Response(object.body, { headers });
}
