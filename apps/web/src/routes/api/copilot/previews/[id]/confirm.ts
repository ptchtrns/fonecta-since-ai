import { copilotConfirmSchema, copilotIdSchema } from '~/schemas/copilot.schema';
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
import { capabilitiesFor } from '~/services/copilot-context.service';
import { confirmPreview } from '~/services/copilot-previews.service';

const closedMessages: Record<string, string> = {
  cancelled: 'This preview was cancelled.',
  expired: 'This preview expired. Ask again for a fresh one.',
  stale: 'Something changed since this preview was made. Ask again for a fresh one.',
  committed: 'This change was already confirmed.',
  failed: 'This change failed. Ask again to try once more.',
  confirmed: 'This change is being confirmed.',
};

/** The owner confirms a preview. The only way the copilot changes anything. */
export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return notFound('Choose your business first');
  const params = copilotIdSchema.safeParse(event.params);
  if (!params.success) return notFound();
  const validation = copilotConfirmSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, copilotConfirmSchema);

  const owner = { userId: user.id, entityId: user.entityId };
  const [error, result] = await confirmPreview(
    owner,
    capabilitiesFor(user, user.entityId),
    publicOrigin(event.request),
    params.data.id,
    validation.data.idempotencyKey,
  );
  if (error) {
    switch (error.reason) {
      case 'NotFound':
        return notFound('This preview was not found');
      case 'NotAllowed':
        return json({ message: 'Your account can’t make this change.' }, 403);
      case 'InProgress':
        return json({ message: closedMessages.confirmed }, 409);
      case 'Closed':
        return json({ message: closedMessages[error.status] ?? 'This preview is closed.' }, 409);
      case 'Stale':
        return json({ message: closedMessages.stale, data: error.preview }, 409);
      case 'Failed':
        return json({ message: error.message, data: error.preview }, 502);
    }
  }
  return json({ message: result.message, data: result.preview });
}
