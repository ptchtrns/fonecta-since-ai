import { finishJobSchema, jobParamsSchema } from '~/schemas/jobs.schema';
import {
  isWorkerRequest,
  json,
  notFound,
  readJson,
  unauthorized,
  unexpected,
  validationFailed,
  type ApiEvent,
} from '~/server/http';
import { finishJob } from '~/services/jobs.service';
import { PREDICT_BUSINESS_JOB, savePredictionRefresh } from '~/services/predictions.service';

// Called by apps/worker to report a job result.
export async function PATCH(event: ApiEvent) {
  if (!isWorkerRequest(event.request)) return unauthorized();

  const params = jobParamsSchema.safeParse(event.params);
  if (!params.success) return validationFailed(params.error, jobParamsSchema);

  const validation = finishJobSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, finishJobSchema);

  const [error, job] = await finishJob(params.data.id, validation.data);
  if (error) {
    switch (error.reason) {
      case 'JobNotFound':
        return notFound('Job not found');
      case 'JobNotRunning':
        return json({ message: 'Job is not running' }, 409);
      default:
        return unexpected();
    }
  }

  if (job.type === PREDICT_BUSINESS_JOB && job.status === 'done') await savePredictionRefresh(job.result);

  return json({ data: job });
}
