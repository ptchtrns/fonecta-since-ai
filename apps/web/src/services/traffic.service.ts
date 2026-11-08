import 'server-only';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { analyticsDaily } from '~/db/schema';
import { shiftDate } from '~/lib/hours';
import { CHART_DAYS, summarize, type Day, type Traffic } from '~/lib/traffic';
import { db } from '~/server/db';
import { analyticsReport } from '~/server/yext';
import type { Business } from '~/services/business.service';
import { today } from '~/services/suggestions.service';

// How many people saw and used the business's Google profile. The dataset has daily statistics for its businesses
// (Yext Analytics' metrics, up to its snapshot). For the Yext account's businesses, Yext's Analytics API is asked;
// when it answers with an error, the Reports page shows that error instead of zeros.

async function datasetDays(entityId: string): Promise<Day[]> {
  // The latest day the dataset has for this business: its statistics end at the snapshot, a few days back.
  const [latest] = await db
    .select({ date: analyticsDaily.date })
    .from(analyticsDaily)
    .where(eq(analyticsDaily.entityId, entityId))
    .orderBy(desc(analyticsDaily.date))
    .limit(1);
  if (!latest) return [];
  return db
    .select({
      date: analyticsDaily.date,
      searchViews: analyticsDaily.googleSearchViews,
      mapViews: analyticsDaily.googleMapViews,
      searches: analyticsDaily.googleSearchQueries,
      actions: analyticsDaily.googleCustomerActions,
      calls: analyticsDaily.googlePhoneCalls,
      profileViews: analyticsDaily.profileViews,
    })
    .from(analyticsDaily)
    .where(
      and(
        eq(analyticsDaily.entityId, entityId),
        gte(analyticsDaily.date, shiftDate(latest.date, -(CHART_DAYS - 1))),
        lte(analyticsDaily.date, latest.date),
      ),
    );
}

/** The business's Google statistics, or why there are none. */
export async function getTrafficReport(business: Pick<Business, 'id' | 'source'>): Promise<TrafficReport> {
  if (business.source !== 'yext') {
    const traffic = summarize('dataset', await datasetDays(business.id));
    return { traffic, unavailable: traffic ? null : 'The dataset has no statistics for this business.' };
  }
  const to = today();
  const report = await analyticsReport('yext', business.id, shiftDate(to, -(CHART_DAYS - 1)), to);
  if (!report) return { traffic: null, unavailable: 'Yext isn’t connected, so there are no statistics.' };
  if (!report.ok) return { traffic: null, unavailable: `Yext’s Analytics API answered: “${report.error}”` };
  const traffic = summarize(
    'yext',
    report.days.map((d) => ({
      date: d.date.slice(0, 10),
      searchViews: d.GOOGLE_SEARCH_VIEWS ?? 0,
      mapViews: d.GOOGLE_MAP_VIEWS ?? 0,
      searches: d.GOOGLE_SEARCH_QUERIES ?? 0,
      actions: d.GOOGLE_CUSTOMER_ACTIONS ?? 0,
      calls: d.GOOGLE_PHONE_CALLS ?? 0,
      profileViews: d.PROFILE_VIEWS ?? 0,
    })),
  );
  return { traffic, unavailable: traffic ? null : 'Yext has no statistics for this business yet.' };
}

export type TrafficReport = { traffic: Traffic | null; unavailable: string | null };

export const getTraffic = async (business: Pick<Business, 'id' | 'source'>) =>
  (await getTrafficReport(business)).traffic;
