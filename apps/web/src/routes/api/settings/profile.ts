import { updateProfileSchema } from '~/schemas/settings.schema';
import {
  currentUser,
  json,
  readJson,
  unauthorized,
  unexpected,
  validationFailed,
  type ApiEvent,
} from '~/server/http';
import { updateProfile } from '~/services/settings.service';

export async function PATCH(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();

  const validation = updateProfileSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, updateProfileSchema);

  const [error, profile] = await updateProfile(user.id, validation.data);
  if (error) {
    switch (error.reason) {
      case 'UserNotFound':
        return unauthorized();
      default:
        return unexpected();
    }
  }

  return json({ message: 'Profile updated', data: profile });
}
