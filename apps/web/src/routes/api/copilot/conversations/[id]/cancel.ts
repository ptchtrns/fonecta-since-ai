import { copilotIdSchema } from '~/schemas/copilot.schema';
import { currentUser, json, notFound, unauthorized, type ApiEvent } from '~/server/http';
import { stopTurn } from '~/services/copilot.service';

/** Stop: the answer being worked on is dropped, with any previews it made. */
export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  const params = copilotIdSchema.safeParse(event.params);
  if (!params.success) return notFound();
  const [error, result] = await stopTurn(user, params.data.id);
  if (error) return notFound();
  return json({ message: result.stopped ? 'Stopped' : 'Nothing to stop' });
}
