import 'server-only';
import { and, eq, ne, notInArray } from 'drizzle-orm';
import { job, prediction, suggestionState } from '~/db/schema';
import { predictBusinessResultSchema } from '~/schemas/predictions.schema';
import { db } from '~/server/db';
import { log } from '~/server/log';
import { enqueueJob } from '~/services/jobs.service';

// Handled by apps/worker, which runs apps/predictor for the one business.
export const PREDICT_BUSINESS_JOB = 'predict-business';

/**
 * Asks the worker to predict this business again, so its next suggestions take the owner's latest answer into
 * account. A refresh that is already waiting covers this one too.
 */
export async function queuePredictionRefresh(entityId: string) {
  const waiting = await db
    .select({ payload: job.payload })
    .from(job)
    .where(and(eq(job.type, PREDICT_BUSINESS_JOB), eq(job.status, 'queued')));
  if (waiting.some((w) => w.payload.entityId === entityId)) return;
  await enqueueJob(null, { type: PREDICT_BUSINESS_JOB, payload: { entityId } });
}

/**
 * Replaces the business's predictions with the worker's fresh ones. Rows for days the owner has already answered
 * stay: the importance levels on the dashboard are measured against them too.
 */
export async function savePredictionRefresh(result: unknown) {
  const parsed = predictBusinessResultSchema.safeParse(result);
  if (!parsed.success) {
    log.warn('predictions', 'refresh result not understood', { issues: parsed.error.issues.length });
    return;
  }
  const { entityId, predictions } = parsed.data;

  const answered = await db
    .select({ key: suggestionState.suggestionKey })
    .from(suggestionState)
    .where(and(eq(suggestionState.entityId, entityId), ne(suggestionState.status, 'pending')));
  const answeredDates = answered.map((a) => a.key);

  const replaced = answeredDates.length
    ? and(eq(prediction.entityId, entityId), notInArray(prediction.date, answeredDates))
    : eq(prediction.entityId, entityId);
  const fresh = predictions.filter((p) => !answeredDates.includes(p.date));

  // One statement per row keeps each well under D1's limit on bound values.
  await db.batch([
    db.delete(prediction).where(replaced),
    ...fresh.map((p) =>
      db.insert(prediction).values({
        entityId,
        date: p.date,
        dayKey: p.day_key,
        action: p.action,
        shownHours: p.shown,
        hours: p.hours,
        confidence: p.confidence,
        reasons: p.reasons,
      }),
    ),
  ]);
  log.info('predictions', 'refreshed', { entityId, predictions: fresh.length });
}
