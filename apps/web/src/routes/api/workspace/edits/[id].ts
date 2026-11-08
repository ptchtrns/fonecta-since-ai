import { publishedSummary } from '~/lib/messages';
import { answerEditSchema, editIdSchema } from '~/schemas/business.schema';
import {
  currentUser,
  json,
  notFound,
  readJson,
  unauthorized,
  validationFailed,
  type ApiEvent,
} from '~/server/http';
import { answerEdit } from '~/services/edits.service';

/** The owner accepts or rejects an edit a Google user or another site suggested. */
export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return notFound('Choose your business first');

  const params = editIdSchema.safeParse(event.params);
  if (!params.success) return notFound();
  const validation = answerEditSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, answerEditSchema);

  const [error, result] = await answerEdit(user.entityId, params.data.id, validation.data.accept);
  if (error) {
    return error.reason === 'YextRejected'
      ? json({ message: `Yext didn’t accept it: ${error.message}` }, 502)
      : notFound('This edit is no longer waiting');
  }
  const message = {
    published: publishedSummary(result.sites),
    saved: 'Accepted. Your hours here are updated; it goes live once publishing to Yext is connected.',
    rejected: 'Rejected. Your listing stays as it is.',
    closure: 'Thanks. A person at Fonecta will check before anything changes on your listing.',
  }[result.outcome];
  return json({ message, data: result });
}
