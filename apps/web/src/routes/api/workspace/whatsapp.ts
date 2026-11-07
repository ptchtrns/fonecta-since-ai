import { whatsappSchema } from '~/schemas/business.schema';
import { savedReply } from '~/server/channel-replies';
import {
  currentUser,
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
  return savedReply('WHATSAPP', result);
}
