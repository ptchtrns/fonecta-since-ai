// Finds opening hours for specific dates in a web page, so a suggestion can be compared with what the owner's own
// site says. Deliberately strict: a page only counts when a date or holiday name is followed by hours or "closed".

const MONTHS: [string, number][] = [
  ['tammikuu', 1],
  ['helmikuu', 2],
  ['maaliskuu', 3],
  ['huhtikuu', 4],
  ['toukokuu', 5],
  ['kesäkuu', 6],
  ['heinäkuu', 7],
  ['elokuu', 8],
  ['syyskuu', 9],
  ['lokakuu', 10],
  ['marraskuu', 11],
  ['joulukuu', 12],
  ['january', 1],
  ['januari', 1],
  ['januar', 1],
  ['jan', 1],
  ['february', 2],
  ['februari', 2],
  ['februar', 2],
  ['feb', 2],
  ['march', 3],
  ['mars', 3],
  ['mar', 3],
  ['april', 4],
  ['apr', 4],
  ['may', 5],
  ['maj', 5],
  ['mai', 5],
  ['june', 6],
  ['juni', 6],
  ['jun', 6],
  ['july', 7],
  ['juli', 7],
  ['jul', 7],
  ['august', 8],
  ['augusti', 8],
  ['aug', 8],
  ['september', 9],
  ['sep', 9],
  ['october', 10],
  ['oktober', 10],
  ['oct', 10],
  ['okt', 10],
  ['november', 11],
  ['nov', 11],
  ['december', 12],
  ['desember', 12],
  ['dec', 12],
  ['des', 12],
];
const MONTH_WORD = [...MONTHS]
  .map(([word]) => word)
  .sort((a, b) => b.length - a.length)
  .join('|');
const monthNumber = (word: string) =>
  MONTHS.filter(([name]) => word.toLowerCase().startsWith(name)).sort(
    (a, b) => b[0].length - a[0].length,
  )[0]?.[1];

const CLOSED = /\b(suljettu|kiinni|stängt|stängd|stengt|closed)\b/i;
const TIME_RANGE = /(\d{1,2})(?:[.:](\d{2}))?\s*[-–—]\s*(\d{1,2})(?:[.:](\d{2}))?/g;
// How far after a date its hours can be. Beyond this the text is about something else.
const WINDOW = 50;

export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&ndash;|&mdash;|&#821[12];/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&auml;/g, 'ä')
    .replace(/&ouml;/g, 'ö')
    .replace(/\s+/g, ' ');
}

function hoursIn(text: string): string | null {
  const closed = CLOSED.exec(text);
  const ranges: string[] = [];
  let firstRange = Number.POSITIVE_INFINITY;
  for (const m of text.matchAll(TIME_RANGE)) {
    const [from, to] = [Number(m[1]), Number(m[3])];
    if (from > 24 || to > 24) continue;
    firstRange = Math.min(firstRange, m.index);
    const time = (hour: string, minute?: string) => `${hour.padStart(2, '0')}:${minute ?? '00'}`;
    ranges.push(`${time(m[1]!, m[2])}-${time(m[3]!, m[4])}`);
  }
  if (closed && closed.index < firstRange) return 'closed';
  return ranges.length ? ranges.join(',') : null;
}

/** The next date on or after `today` with this month and day. */
function nextDate(month: number, day: number, today: string): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = Number(today.slice(0, 4));
  const date = `${year}-${pad(month)}-${pad(day)}`;
  return date >= today ? date : `${year + 1}-${pad(month)}-${pad(day)}`;
}

/**
 * Date to hours text for each date the page gives hours for.
 * `holidays` maps a holiday's name in lower case to its next date, because sites often write "Jouluaatto: suljettu".
 */
export function readHours(
  html: string,
  today: string,
  holidays: Record<string, string> = {},
): Record<string, string> {
  const text = pageText(html);
  const marks: { date: string; start: number; end: number }[] = [];
  const add = (date: string | null, start: number, end: number) => {
    if (date) marks.push({ date, start, end });
  };

  for (const m of text.matchAll(/\b(\d{1,2})[./](\d{1,2})\b\.?(?:\d{2,4}\b)?/g)) {
    add(nextDate(Number(m[2]), Number(m[1]), today), m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})\\.?\\s+(${MONTH_WORD})[a-zä]*\\b`, 'gi'))) {
    add(nextDate(monthNumber(m[2]!) ?? 0, Number(m[1]), today), m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(new RegExp(`\\b(${MONTH_WORD})[a-zä]*\\s+(\\d{1,2})\\b`, 'gi'))) {
    add(nextDate(monthNumber(m[1]!) ?? 0, Number(m[2]), today), m.index, m.index + m[0].length);
  }
  const lower = text.toLowerCase();
  for (const [name, date] of Object.entries(holidays)) {
    for (let at = lower.indexOf(name); at !== -1; at = lower.indexOf(name, at + name.length)) {
      add(date, at, at + name.length);
    }
  }

  marks.sort((a, b) => a.start - b.start);
  const found: Record<string, string> = {};
  marks.forEach((mark, i) => {
    const stop = Math.min(marks[i + 1]?.start ?? text.length, mark.end + WINDOW);
    const hours = hoursIn(text.slice(mark.end, stop));
    if (hours && !found[mark.date]) found[mark.date] = hours;
  });
  return found;
}

/** Only public web pages can be linked. Workers can't reach private networks, but `pnpm dev` can. */
export function isPublicUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host.startsWith('[') || !host.includes('.')) return false;
  return !/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}
