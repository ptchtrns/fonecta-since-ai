import 'server-only';
import { and, eq, ne } from 'drizzle-orm';
import { account, session, user } from '~/db/schema';
import { err, ok } from '~/lib/result';
import type { ChangePasswordPayload, UpdateProfilePayload } from '~/schemas/settings.schema';
import { db } from '~/server/db';
import { hashPassword, verifyPassword } from '~/server/password';

export async function updateProfile(userId: string, payload: UpdateProfilePayload) {
  const [updated] = await db
    .update(user)
    .set({ name: payload.name })
    .where(eq(user.id, userId))
    .returning({ id: user.id, name: user.name, email: user.email });

  if (!updated) return err({ reason: 'UserNotFound' as const });
  return ok(updated);
}

/** Verifies the current password, stores the new hash and signs out every other session. */
export async function changePassword(
  userId: string,
  { oldPassword, newPassword }: ChangePasswordPayload,
  currentSessionId: string,
) {
  const [credential] = await db
    .select({ id: account.id, password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .limit(1);

  if (!credential?.password) return err({ reason: 'NoPasswordAccount' as const });

  const valid = await verifyPassword({ hash: credential.password, password: oldPassword });
  if (!valid) return err({ reason: 'IncorrectPassword' as const });

  await db.batch([
    db
      .update(account)
      .set({ password: await hashPassword(newPassword) })
      .where(eq(account.id, credential.id)),
    db.delete(session).where(and(eq(session.userId, userId), ne(session.id, currentSessionId))),
  ]);

  return ok(null);
}
