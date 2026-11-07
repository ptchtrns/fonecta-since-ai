/**
 * Whether it's now within the owner's contact window, like "12-16", in the business's own time zone.
 * The window is whole hours: "12-16" means from 12:00 up to 16:00. An unreadable window doesn't hold
 * anything back.
 */
export function inContactWindow(window: string, timeZone: string, now: Date = new Date()): boolean {
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(window.trim());
  if (!match) return true;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const hour = localHour(now, timeZone);
  return hour >= start && hour < end;
}

function localHour(now: Date, timeZone: string): number {
  const text = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(now);
  return Number(text);
}
