import { businessEditSchema } from '~/schemas/business.schema';
import {
  currentUser,
  json,
  notFound,
  readJson,
  unauthorized,
  validationFailed,
  type ApiEvent,
} from '~/server/http';
import { saveBusiness } from '~/services/business.service';

export async function PATCH(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return notFound('Choose your business first');

  const validation = businessEditSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, businessEditSchema);

  const [error, result] = await saveBusiness(user.entityId, validation.data);
  if (error) {
    return error.reason === 'YextRejected'
      ? json({ message: `Google and the other sites didn't accept it: ${error.message}` }, 502)
      : notFound();
  }
  if (!result.changed) return json({ message: 'Nothing to change' });
  return json({
    message: result.published
      ? 'Saved and published'
      : 'Saved. It goes live once publishing to Yext is connected.',
  });
}
