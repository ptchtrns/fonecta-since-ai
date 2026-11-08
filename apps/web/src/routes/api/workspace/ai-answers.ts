import { currentUser, json, notFound, unauthorized, type ApiEvent } from '~/server/http';
import { customerAnswers } from '~/services/assistant.service';

/** A language model's answers to the AI tab's customer questions, from the listing alone. */
export async function GET(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return notFound('Choose your business first');

  const [error, result] = await customerAnswers(user.entityId);
  if (error) {
    switch (error.reason) {
      case 'NoModel':
        return json({ message: 'No language model is connected (FEATHERLESS_API_KEY).' }, 503);
      case 'ModelFailed':
        return json({ message: 'The language model didn’t answer. Try again in a moment.' }, 502);
      default:
        return notFound();
    }
  }
  return json({ data: result });
}
