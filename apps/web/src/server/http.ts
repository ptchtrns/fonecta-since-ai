import 'server-only';
import type { RequestEvent } from '@solidjs/web';
import { env } from 'cloudflare:workers';
import type { z } from 'zod';
import type { ApiResponse } from '~/lib/api';
import type { SessionUser } from '~/server/auth';
import { handleValidationError } from '~/lib/validation';

/** What API route handlers receive: the request event plus matched route params. */
export type ApiEvent = RequestEvent & { params: Record<string, string> };

export function json<T>(body: ApiResponse<T>, status = 200): Response {
  return Response.json(body satisfies ApiResponse<T>, { status });
}

export const unauthorized = () => json({ message: 'Unauthorized' }, 401);
export const notFound = (message = 'Not found') => json({ message }, 404);
export const unexpected = () => json({ message: 'Unexpected error' }, 500);

/** Parses a JSON body, returning undefined on malformed input so zod reports it. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

/** 400 response for a failed safeParse. Field errors are limited to the schema's top-level keys. */
export function validationFailed(error: z.ZodError, schema: z.ZodObject): Response {
  const { root, fieldErrors } = handleValidationError(error, Object.keys(schema.shape));
  return json({ message: root, fieldErrors }, 400);
}

/** Session user resolved by the session middleware. */
export function currentUser(event: RequestEvent): SessionUser | null {
  return event.locals.user ?? null;
}

/** Base URL for links sent to owners. APP_URL is the public address (a tunnel locally) phones can open. */
export function publicOrigin(request: Request): string {
  const configured = (env as { APP_URL?: string }).APP_URL;
  return (configured || new URL(request.url).origin).replace(/\/$/, '');
}

/** Checks the `Authorization: Bearer <WORKER_TOKEN>` header sent by apps/worker. */
export function isWorkerRequest(request: Request): boolean {
  const expected = env.WORKER_TOKEN;
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!expected || token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
