import { whatsappSchema } from '~/schemas/business.schema';
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
import { saveWhatsApp } from '~/services/contact.service';

export async function PATCH(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return notFound('Choose your business first');

  const validation = whatsappSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, whatsappSchema);

  const [error, result] = await saveWhatsApp(user.entityId, validation.data, publicOrigin(event.request));
  if (error) return notFound();
  if (result.error) return json({ message: `Saved, but WhatsApp didn't send it: ${result.error}` }, 502);

  const parts = ['Saved.'];
  if (result.applied)
    parts.push(`${result.applied} holiday ${result.applied === 1 ? 'day' : 'days'} updated.`);
  if (result.sent) parts.push('Your most important suggestion is on its way to WhatsApp.');
  return json({ message: parts.join(' ') });
}
