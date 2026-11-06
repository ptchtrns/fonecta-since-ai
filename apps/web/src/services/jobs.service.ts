import 'server-only';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { job, type Job } from '~/db/schema';
import { err, ok } from '~/lib/result';
import type { ClaimJobPayload, CreateJobPayload, FinishJobPayload } from '~/schemas/jobs.schema';
import { db } from '~/server/db';

// A running job without a result after this long is assumed abandoned and can be claimed again.
const STALE_AFTER_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export async function enqueueJob(userId: string, { type, payload }: CreateJobPayload) {
  const [row] = await db.insert(job).values({ id: crypto.randomUUID(), type, payload, userId }).returning();
  return ok(row!);
}

export async function listJobs(userId: string, limit = 20) {
  const rows = await db
    .select()
    .from(job)
    .where(eq(job.userId, userId))
    .orderBy(desc(job.createdAt))
    .limit(limit);
  return ok(rows);
}

/** Atomically marks the oldest claimable job as running and returns it, or null when the queue is empty. */
export async function claimNextJob({ types }: ClaimJobPayload) {
  const now = new Date();
  const claimable = or(
    eq(job.status, 'queued'),
    and(
      eq(job.status, 'running'),
      lt(job.claimedAt, new Date(now.getTime() - STALE_AFTER_MS)),
      lt(job.attempts, MAX_ATTEMPTS),
    ),
  );

  const next = db
    .select({ id: job.id })
    .from(job)
    .where(types?.length ? and(claimable, inArray(job.type, types)) : claimable)
    .orderBy(job.createdAt)
    .limit(1);

  const [claimed] = await db
    .update(job)
    .set({ status: 'running', claimedAt: now, attempts: sql`${job.attempts} + 1` })
    .where(inArray(job.id, next))
    .returning();

  return ok<Job | null>(claimed ?? null);
}

export async function finishJob(id: string, { status, result, error }: FinishJobPayload) {
  const [current] = await db.select({ status: job.status }).from(job).where(eq(job.id, id));
  if (!current) return err({ reason: 'JobNotFound' as const });
  if (current.status !== 'running') return err({ reason: 'JobNotRunning' as const });

  const [updated] = await db
    .update(job)
    .set({ status, result: result ?? null, error: error ?? null, finishedAt: new Date() })
    .where(and(eq(job.id, id), eq(job.status, 'running')))
    .returning();

  if (!updated) return err({ reason: 'JobNotRunning' as const });
  return ok(updated);
}
