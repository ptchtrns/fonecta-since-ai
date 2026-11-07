import { currentUser, json, notFound, unauthorized, type ApiEvent } from '~/server/http';
import { disconnectTelegram } from '~/services/contact.service';

/** Stops suggestions on Telegram. The owner can connect again with a new link. */
export async function DELETE(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return notFound('Choose your business first');
  await disconnectTelegram(user.entityId);
  return json({ message: 'Telegram disconnected.' });
}
