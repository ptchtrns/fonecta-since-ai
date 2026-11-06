import { auth } from '~/server/auth';
import type { ApiEvent } from '~/server/http';

// Better Auth owns everything under /api/auth (sign in, sign up, sign out, session).
export const GET = (event: ApiEvent) => auth.handler(event.request);
export const POST = GET;
