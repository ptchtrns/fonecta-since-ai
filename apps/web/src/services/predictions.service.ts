import 'server-only';
import { and, eq } from 'drizzle-orm';
import { calendarSpecialDay, entity, prediction } from '~/db/schema';
import { ok } from '~/lib/result';
import { db } from '~/server/db';

/** The predictor's decisions for the demo businesses, soonest day first. Local and deployed show the same set. */
export async function listPredictions() {
  const rows = await db
    .select({
      entityId: prediction.entityId,
      date: prediction.date,
      dayKey: prediction.dayKey,
      action: prediction.action,
      shownHours: prediction.shownHours,
      hours: prediction.hours,
      confidence: prediction.confidence,
      reasons: prediction.reasons,
      businessName: entity.name,
      city: entity.city,
      // Local events and school breaks aren't in the calendar.
      dayName: calendarSpecialDay.nameEn,
    })
    .from(prediction)
    .innerJoin(entity, eq(prediction.entityId, entity.id))
    .leftJoin(
      calendarSpecialDay,
      and(eq(calendarSpecialDay.country, entity.country), eq(calendarSpecialDay.date, prediction.date)),
    )
    .where(eq(entity.split, 'demo'))
    .orderBy(prediction.date, entity.name);
  return ok(rows);
}

export type PredictionDto = NonNullable<Awaited<ReturnType<typeof listPredictions>>[1]>[number];
