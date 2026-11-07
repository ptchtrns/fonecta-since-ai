import { contactSchema } from '~/schemas/business.schema';
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
import { saveContact } from '~/services/contact.service';

export async function PATCH(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return notFound('Choose your business first');

  const validation = contactSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, contactSchema);

  const [error, result] = await saveContact(user.entityId, validation.data, publicOrigin(event.request));
  if (error?.reason === 'NotFound') return notFound();
  if (validation.data.optedOut) return json({ message: "Saved. We won't send you suggestion messages." });
  if (result?.sent) return json({ message: 'Saved. Your most important suggestion is on its way.' });
  return json({ message: 'Saved. Suggestions will reach you again within your contact hours.' });
}
