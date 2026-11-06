import { claimJobSchema } from '~/schemas/jobs.schema';
import {
  isWorkerRequest,
  json,
  readJson,
  unauthorized,
  validationFailed,
  type ApiEvent,
} from '~/server/http';
import { claimNextJob } from '~/services/jobs.service';

// Called by apps/worker. Responds 204 when there is nothing to do.
export async function POST(event: ApiEvent) {
  if (!isWorkerRequest(event.request)) return unauthorized();

  const validation = claimJobSchema.safeParse((await readJson(event.request)) ?? {});
  if (!validation.success) return validationFailed(validation.error, claimJobSchema);

  const [, job] = await claimNextJob(validation.data);
  if (!job) return new Response(null, { status: 204 });
  return json({ data: job });
}
