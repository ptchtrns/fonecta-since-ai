import { copilotSendSchema } from '~/schemas/copilot.schema';
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
import { sendMessage } from '~/services/copilot.service';

/** The owner's message to the copilot. Answers with the conversation, including any previews it made. */
export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return notFound('Choose your business first');

  const validation = copilotSendSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, copilotSendSchema);

  const [error, result] = await sendMessage(
    user,
    validation.data,
    publicOrigin(event.request),
    event.request.signal,
  );
  if (error) {
    switch (error.reason) {
      case 'NoModel':
        return json({ message: 'No language model is connected (FEATHERLESS_API_KEY).' }, 503);
      case 'Busy':
        return json({ message: 'Still answering your last message. Wait for it or press Stop.' }, 409);
      case 'RateLimited':
        return json({ message: 'That’s a lot of questions at once. Try again in a minute.' }, 429);
      case 'NoBusiness':
        return notFound('Choose your business first');
      default:
        return notFound('This conversation was not found');
    }
  }
  return json({ data: result.conversation });
}
