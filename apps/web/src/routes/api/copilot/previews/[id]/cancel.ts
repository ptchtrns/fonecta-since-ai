import { copilotIdSchema } from '~/schemas/copilot.schema';
import { currentUser, json, notFound, unauthorized, type ApiEvent } from '~/server/http';
import { cancelPreview } from '~/services/copilot-previews.service';

/** The owner cancels a preview. Nothing was changed, and now nothing can be from it. */
export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return notFound();
  const params = copilotIdSchema.safeParse(event.params);
  if (!params.success) return notFound();
  const [error, result] = await cancelPreview({ userId: user.id, entityId: user.entityId }, params.data.id);
  if (error)
    return error.reason === 'NotFound'
      ? notFound()
      : json({ message: 'This preview is already closed.' }, 409);
  return json({ message: 'Cancelled. Nothing was changed.', data: result.preview });
}
