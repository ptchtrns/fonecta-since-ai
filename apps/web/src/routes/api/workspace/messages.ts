import { messageSettingsSchema } from '~/schemas/business.schema';
import {
  currentUser,
  json,
  notFound,
  publicOrigin,
  readJson,
  unauthorized,
  validationFailed,
  type ApiEvent,
} from '~/server/http';
import { saveMessageSettings } from '~/services/contact.service';

/** Language, level and standing permission: the same on every channel. */
export async function PATCH(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return notFound('Choose your business first');

  const validation = messageSettingsSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, messageSettingsSchema);

  const [error, result] = await saveMessageSettings(
    user.entityId,
    validation.data,
    publicOrigin(event.request),
  );
  if (error) return notFound();
  const parts = ['Saved.'];
  if (result.applied)
    parts.push(`${result.applied} holiday ${result.applied === 1 ? 'day' : 'days'} updated.`);
  if (result.sent) parts.push('Your most important suggestion is on its way.');
  return json({ message: parts.join(' ') });
}
