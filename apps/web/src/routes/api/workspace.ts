import { currentUser, json, publicOrigin, unauthorized, type ApiEvent } from '~/server/http';
import { getWorkspace } from '~/services/workspace.service';

/** Everything the dashboard shows. `data` is null until the account has chosen a business. */
export async function GET(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return json({ data: null });
  return json({ data: await getWorkspace(user.entityId, publicOrigin(event.request)) });
}
