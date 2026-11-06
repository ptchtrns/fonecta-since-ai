import { createJobSchema } from '~/schemas/jobs.schema';
import { currentUser, json, readJson, unauthorized, validationFailed, type ApiEvent } from '~/server/http';
import { enqueueJob, listJobs } from '~/services/jobs.service';

export async function GET(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();

  const [, jobs] = await listJobs(user.id);
  return json({ data: jobs });
}

export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();

  const validation = createJobSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, createJobSchema);

  const [, job] = await enqueueJob(user.id, validation.data);
  return json({ message: 'Job queued', data: job }, 201);
}
