import 'server-only';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { env } from 'cloudflare:workers';
import { account, session, user, verification } from '~/db/schema';
import { db } from '~/server/db';
import { log } from '~/server/log';
import { hashPassword, verifyPassword } from '~/server/password';
import { isSelectableBusiness } from '~/services/business.service';
import { onBusinessLinked } from '~/services/contact.service';

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  // Optional. Set BETTER_AUTH_URL once the app has a fixed domain (needed for OAuth callbacks).
  baseURL: (env as { BETTER_AUTH_URL?: string }).BETTER_AUTH_URL || undefined,
  // Same-origin requests are always trusted, whatever host or port the app is served on.
  trustedOrigins: (request) => (request ? [new URL(request.url).origin] : []),
  basePath: '/api/auth',
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 100,
    password: { hash: hashPassword, verify: verifyPassword },
  },
  user: {
    // Chosen with the combobox on the sign-up form.
    additionalFields: { entityId: { type: 'string', required: false, input: true } },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const { entityId } = user as { entityId?: string | null };
          if (!entityId || !(await isSelectableBusiness(entityId))) {
            throw new APIError('BAD_REQUEST', { message: 'Choose your business from the list' });
          }
        },
        after: async (user) => {
          const { entityId } = user as { entityId?: string | null };
          // The account exists by now, so a problem here must not fail the sign-up.
          if (entityId)
            await onBusinessLinked(entityId).catch((error) => log.error('auth', 'link failed', { error }));
        },
      },
    },
  },
  // Sessions are read from D1 on every request. Better Auth's cookieCache would save that read,
  // but profile edits and revoked sessions would then lag behind by the cache lifetime.
  telemetry: { enabled: false },
});

export type AuthSession = typeof auth.$Infer.Session;
export type SessionUser = AuthSession['user'];
