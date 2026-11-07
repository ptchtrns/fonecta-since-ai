// Opening hours as text, the same way the predictor writes them: "closed" or "10:00-14:00,17:00-22:00".
import type { DayHours, WeekHours } from '~/db/schema';

export const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export const HOURS_TEXT =
  /^(closed|([01]\d|2[0-4]):[0-5]\d-([01]\d|2[0-4]):[0-5]\d(,([01]\d|2[0-4]):[0-5]\d-([01]\d|2[0-4]):[0-5]\d)*)$/;

export type Interval = { open: string; close: string };

export function toIntervals(text: string): Interval[] {
  if (text === 'closed') return [];
  return text.split(',').map((part) => {
    const [open = '', close = ''] = part.split('-');
    return { open, close };
  });
}

export function fromIntervals(intervals: Interval[]): string {
  return intervals.length ? intervals.map((i) => `${i.open}-${i.close}`).join(',') : 'closed';
}

export function dayToText(day: DayHours | undefined): string {
  const intervals = day?.openIntervals ?? [];
  if (day?.isClosed || !intervals.length) return 'closed';
  return intervals.map((i) => `${i.start}-${i.end}`).join(',');
}

export function textToDay(text: string): DayHours {
  const intervals = toIntervals(text);
  return intervals.length
    ? { openIntervals: intervals.map((i) => ({ start: i.open, end: i.close })) }
    : { isClosed: true };
}

export function weekToText(hours: WeekHours): Record<Weekday, string> {
  return Object.fromEntries(WEEKDAYS.map((d) => [d, dayToText(hours[d])])) as Record<Weekday, string>;
}

/** "Closed" or "10:00–14:00, 17:00–22:00". */
export function formatHours(text: string): string {
  if (text === 'closed') return 'Closed';
  return text.replaceAll('-', '–').replaceAll(',', ', ');
}

/** "Thu 24 Dec" from YYYY-MM-DD. */
export function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`)
    .toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
    .replace(',', '');
}

/** Whole days from one YYYY-MM-DD to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Consecutive days with equal hours, for the business card: "Mon – Fri", "Sat", "Sun". */
export function groupWeek(hours: Record<Weekday, string>): { days: string; hours: string }[] {
  const groups: { from: Weekday; to: Weekday; hours: string }[] = [];
  for (const day of WEEKDAYS) {
    const last = groups.at(-1);
    if (last?.hours === hours[day]) last.to = day;
    else groups.push({ from: day, to: day, hours: hours[day] });
  }
  return groups.map((g) => ({
    days: g.from === g.to ? WEEKDAY_SHORT[g.from] : `${WEEKDAY_SHORT[g.from]} – ${WEEKDAY_SHORT[g.to]}`,
    hours: g.hours,
  }));
}
