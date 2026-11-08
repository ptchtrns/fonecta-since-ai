// Google statistics for the Reports page: totals for the last four weeks against the four before, and a daily chart.
import { shiftDate } from '~/lib/hours';

/** The period the totals cover, compared with the same number of days before it. */
const PERIOD_DAYS = 28;
/** The chart's length. */
export const CHART_DAYS = 91;

export type TrafficTotals = {
  /** Google Search and Maps views. */
  views: number;
  searchViews: number;
  mapViews: number;
  /** Searches the business showed up in. */
  searches: number;
  /** Website clicks, direction requests and calls from the profile. */
  actions: number;
  calls: number;
  profileViews: number;
};

export type Traffic = {
  source: 'dataset' | 'yext';
  days: number;
  from: string;
  to: string;
  totals: TrafficTotals;
  /** Share of change against the period before, or null when there's no data for it. */
  change: Record<'views' | 'searches' | 'actions' | 'calls', number | null>;
  daily: { date: string; views: number; actions: number }[];
};

export type Day = { date: string } & Omit<TrafficTotals, 'views'>;

const sum = (days: Day[]): TrafficTotals => {
  const t = days.reduce(
    (acc, d) => ({
      searchViews: acc.searchViews + d.searchViews,
      mapViews: acc.mapViews + d.mapViews,
      searches: acc.searches + d.searches,
      actions: acc.actions + d.actions,
      calls: acc.calls + d.calls,
      profileViews: acc.profileViews + d.profileViews,
    }),
    { searchViews: 0, mapViews: 0, searches: 0, actions: 0, calls: 0, profileViews: 0 },
  );
  return { ...t, views: t.searchViews + t.mapViews };
};

const changeOf = (now: number, before: number | null) => (before ? (now - before) / before : null);

/** Totals, change and chart from daily rows, ending at the latest day there is. */
export function summarize(source: Traffic['source'], days: Day[]): Traffic | null {
  if (!days.length) return null;
  const sorted = days.toSorted((a, b) => a.date.localeCompare(b.date));
  const to = sorted.at(-1)!.date;
  const from = shiftDate(to, -(PERIOD_DAYS - 1));
  const previousFrom = shiftDate(from, -PERIOD_DAYS);
  const current = sorted.filter((d) => d.date >= from);
  const earlier = sorted.filter((d) => d.date >= previousFrom && d.date < from);
  const totals = sum(current);
  const before = earlier.length ? sum(earlier) : null;
  const chartFrom = shiftDate(to, -(CHART_DAYS - 1));
  return {
    source,
    days: PERIOD_DAYS,
    from,
    to,
    totals,
    change: {
      views: changeOf(totals.views, before?.views ?? null),
      searches: changeOf(totals.searches, before?.searches ?? null),
      actions: changeOf(totals.actions, before?.actions ?? null),
      calls: changeOf(totals.calls, before?.calls ?? null),
    },
    daily: sorted
      .filter((d) => d.date >= chartFrom)
      .map((d) => ({ date: d.date, views: d.searchViews + d.mapViews, actions: d.actions })),
  };
}
