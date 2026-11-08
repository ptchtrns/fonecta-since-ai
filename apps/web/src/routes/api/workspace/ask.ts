import { askSchema } from '~/schemas/assistant.schema';
import {
  currentUser,
  json,
  notFound,
  readJson,
  unauthorized,
  validationFailed,
  type ApiEvent,
} from '~/server/http';
import { ask } from '~/services/assistant.service';

/** One answer from the language model: the owner's advisor, or an assistant answering a customer. */
export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return notFound('Choose your business first');

  const validation = askSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, askSchema);

  const [error, result] = await ask(user.entityId, validation.data);
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
