import { linkBusinessSchema } from '~/schemas/business.schema';
import {
  currentUser,
  json,
  notFound,
  readJson,
  unauthorized,
  validationFailed,
  type ApiEvent,
} from '~/server/http';
import { linkUserToBusiness } from '~/services/business.service';
import { onBusinessLinked } from '~/services/contact.service';

/** Chooses the account's business: for accounts from before sign-up asked, and for changing it in Settings. */
export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();

  const validation = linkBusinessSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, linkBusinessSchema);

  const [error] = await linkUserToBusiness(user.id, validation.data.entityId);
  if (error) return notFound('Choose your business from the list');
  await onBusinessLinked(validation.data.entityId);
  return json({ message: 'Business saved' });
}
