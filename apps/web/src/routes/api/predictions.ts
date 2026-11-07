import { currentUser, json, unauthorized, type ApiEvent } from '~/server/http';
import { listPredictions } from '~/services/predictions.service';

export async function GET(event: ApiEvent) {
  if (!currentUser(event)) return unauthorized();

  const [, predictions] = await listPredictions();
  return json({ data: predictions });
}
