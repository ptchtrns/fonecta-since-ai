// Request pipeline for pages and API routes: session lookup, page guards, API dispatch.
import type { StartMiddleware } from '@solidjs/vite-plugin';
import { apiHandler } from '~/server/api-handler';
import { auth } from '~/server/auth';

const PROTECTED_PREFIXES = ['/dashboard'];
const GUEST_ONLY = ['/login'];

const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

const session: StartMiddleware = async (event, next) => {
  const { pathname } = new URL(event.request.url);
  // Better Auth handles its own routes, and files are served without a session.
  if (!pathname.startsWith('/api/auth/') && !pathname.startsWith('/api/files/')) {
    const result = await auth.api.getSession({ headers: event.request.headers });
    event.locals.user = result?.user ?? null;
    event.locals.session = result?.session ?? null;
  }
  return next();
};

const guard: StartMiddleware = (event, next) => {
  const { pathname } = new URL(event.request.url);
  if (event.request.method !== 'GET' || pathname.startsWith('/api/')) return next();

  const signedIn = Boolean(event.locals.user);
  if (!signedIn && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }
  if (signedIn && GUEST_ONLY.includes(pathname)) return redirect('/dashboard');
  return next();
};

const handleAPI: StartMiddleware = (event, next) => apiHandler(event, next);

export default [session, guard, handleAPI];
