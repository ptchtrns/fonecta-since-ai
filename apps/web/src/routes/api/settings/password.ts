import { changePasswordSchema } from '~/schemas/settings.schema';
import {
  currentUser,
  json,
  readJson,
  unauthorized,
  unexpected,
  validationFailed,
  type ApiEvent,
} from '~/server/http';
import { changePassword } from '~/services/settings.service';

export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  const session = event.locals.session;
  if (!user || !session) return unauthorized();

  const validation = changePasswordSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, changePasswordSchema);

  const [error] = await changePassword(user.id, validation.data, session.id);
  if (error) {
    switch (error.reason) {
      case 'IncorrectPassword':
        return json({ fieldErrors: { oldPassword: 'Incorrect password' } }, 400);
      case 'NoPasswordAccount':
        return json({ message: 'This account signs in without a password' }, 400);
      default:
        return unexpected();
    }
  }

  return json({ message: 'Password changed, other sessions were signed out' });
}
