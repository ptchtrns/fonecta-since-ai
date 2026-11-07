import 'server-only';
import { and, eq, gte, sql, type SQL } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import {
  businessSource,
  calendarSpecialDay,
  city,
  entity,
  holidayHoursHistory,
  peerBenchmark,
  publisherSuggestion,
  review,
  type SourceKind,
} from '~/db/schema';
import { err, ok } from '~/lib/result';
import { isPublicUrl, readHours } from '~/lib/source-reader';
import type { LinkSourcePayload } from '~/schemas/business.schema';
import { db } from '~/server/db';
import { log } from '~/server/log';
import type { Business } from '~/services/business.service';
import { today } from '~/services/suggestions.service';

const FETCH_TIMEOUT_MS = 8000;
const MAX_PAGE_CHARS = 2_000_000;

const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/** Holiday names to their next date, because pages often write the name instead of the date. */
async function holidayNames(country: Business['country']) {
  const days = await db
    .select({
      date: calendarSpecialDay.date,
      en: calendarSpecialDay.nameEn,
      local: calendarSpecialDay.nameLocal,
    })
    .from(calendarSpecialDay)
    .where(and(eq(calendarSpecialDay.country, country), gte(calendarSpecialDay.date, today())))
    .orderBy(sql`${calendarSpecialDay.date} DESC`);
  const names: Record<string, string> = {};
  // Soonest date wins, so a name that returns next year points at this year's day.
  for (const day of days) {
    names[day.en.toLowerCase()] = day.date;
    names[day.local.toLowerCase()] = day.date;
  }
  return names;
}

async function readPage(url: string, country: Business['country']) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': 'ConnectaAI-SourceCheck/1.0', accept: 'text/html,text/plain' },
    });
    if (!response.ok) return { status: 'unreachable' as const, findings: {} };
    const html = (await response.text()).slice(0, MAX_PAGE_CHARS);
    return { status: 'read' as const, findings: readHours(html, today(), await holidayNames(country)) };
  } catch (error) {
    log.warn('sources', 'page not read', { error: error instanceof Error ? error.message : String(error) });
    return { status: 'unreachable' as const, findings: {} };
  }
}

/** Links a page, or checks a linked one again. */
export async function linkSource(business: Business, input: LinkSourcePayload) {
  const url = withScheme(input.url);
  if (!isPublicUrl(url)) return err({ reason: 'InvalidUrl' as const });
  const page = await readPage(url, business.country);
  const row = { url, status: page.status, findings: page.findings, checkedAt: new Date() };
  await db
    .insert(businessSource)
    .values({ entityId: business.id, kind: input.kind, ...row })
    .onConflictDoUpdate({ target: [businessSource.entityId, businessSource.kind], set: row });
  return ok(page);
}

export async function unlinkSource(entityId: string, kind: SourceKind) {
  await db
    .delete(businessSource)
    .where(and(eq(businessSource.entityId, entityId), eq(businessSource.kind, kind)));
  return ok({ kind });
}

export const listLinkedSources = (entityId: string) =>
  db.select().from(businessSource).where(eq(businessSource.entityId, entityId));

async function count(table: SQLiteTable, where: SQL) {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(table)
    .where(where);
  return row?.n ?? 0;
}

/** What every suggestion is already based on, with how much of it this business has. */
export async function builtInSources(business: Business) {
  const [history, reviews, googleEdits, centre, peers] = await Promise.all([
    count(holidayHoursHistory, eq(holidayHoursHistory.entityId, business.id)),
    count(review, eq(review.entityId, business.id)),
    count(publisherSuggestion, eq(publisherSuggestion.entityId, business.id)),
    business.shoppingCentreId
      ? db.select({ name: entity.name }).from(entity).where(eq(entity.id, business.shoppingCentreId))
      : Promise.resolve([]),
    db
      .select({ n: sql<number>`count(*)` })
      .from(peerBenchmark)
      .innerJoin(city, eq(city.cityTier, peerBenchmark.cityTier))
      .where(
        and(
          eq(city.name, business.city),
          eq(peerBenchmark.country, business.country),
          eq(peerBenchmark.segment, business.segment),
        ),
      ),
  ]);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    {
      name: 'Your past holiday hours',
      detail: plural(history, 'day entered', 'days entered'),
      active: history > 0,
    },
    ...(centre[0] ? [{ name: 'Shopping centre hours', detail: centre[0].name, active: true }] : []),
    {
      name: 'Similar businesses nearby',
      detail: peers[0]?.n ? 'Anonymised, same type and town size' : 'None to compare with',
      active: !!peers[0]?.n,
    },
    { name: 'Customer reviews', detail: plural(reviews, 'review read', 'reviews read'), active: reviews > 0 },
    {
      name: 'Google user edits',
      detail: plural(googleEdits, 'suggested edit', 'suggested edits'),
      active: googleEdits > 0,
    },
  ];
}

/** Reads every linked page again, so new dates on them get compared. Part of the nightly run. */
export async function recheckSources(business: Business) {
  const sources = await listLinkedSources(business.id);
  for (const source of sources) {
    await linkSource(business, { kind: source.kind, url: source.url });
  }
}
