import { sourceKindSchema } from '~/schemas/business.schema';
import { currentUser, json, notFound, unauthorized, type ApiEvent } from '~/server/http';
import { unlinkSource } from '~/services/sources.service';

export async function DELETE(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return notFound('Choose your business first');

  const params = sourceKindSchema.safeParse(event.params);
  if (!params.success) return notFound();

  await unlinkSource(user.entityId, params.data.kind);
  return json({ message: 'Removed' });
}
