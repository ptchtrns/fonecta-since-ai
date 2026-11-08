// How findable a business is: how complete its profile is, how well it can rank in local search, what AI assistants
// can say about it, and which sites it is listed on. Every check reads data Connect already has (the profile,
// Yext's listings and reviews, and how similar businesses do). The points per check are rules of thumb on what
// Google and assistants weigh; the review target comes from similar businesses where there are enough of them.
import { formatHours, shiftDate, WEEKDAYS, type Weekday } from '~/lib/hours';

/** Where a missing item is fixed: the business details, or the suggestions on the front page. */
export type Fix = 'company' | 'suggestions';
export type Check = { key: string; label: string; detail: string; done: boolean; points: number; fix?: Fix };
export type Report = { score: number; checks: Check[] };

export type ListingSite = {
  publisherId: string;
  name: string;
  /** The name `PublisherLogo` knows the site's logo by. */
  logo: string;
  status: string;
  live: boolean;
  /**
   * Listed, but the owner's own account there isn't linked, so they can't reply to reviews there. Null when the
   * source doesn't say: Yext reports it, the dataset's listings don't.
   */
  needsAccount: boolean | null;
  /** How long a change typically takes to show there, or null when no figure is known for the site. */
  seconds: number | null;
};

/** What similar businesses have: the median review count and average rating among the same type in the country. */
export type PeerReviews = { count: number; averageRating: number; businesses: number };

export type Facts = {
  name: string;
  category: string;
  /** Whether a category is set where the business's details are kept (Yext, or the dataset). */
  categorySet: boolean;
  /** True when `category` was read from the name, because the category set in Yext is Fonecta's own code. */
  categoryGuessed: boolean;
  city: string;
  addressLine1: string;
  phone: string;
  website: string;
  description: string;
  timezone: string;
  /** "closed" or "10:00-14:00" per weekday. */
  hours: Record<Weekday, string>;
  /** Hours entered for special days from today on. */
  holidayHours: { date: string; hours: string }[];
  /** Public holidays soon, on days the business is normally open, with no hours entered. */
  missingHolidays: { date: string; label: string }[];
  listings: ListingSite[];
  reviews: { count: number; averageRating: number };
  /** Null when too few similar businesses have reviews to compare with. */
  peerReviews: PeerReviews | null;
};

/** Days ahead the holiday hours check looks at. */
export const HOLIDAY_WINDOW_DAYS = 60;
/** Characters of description Google rewards, and the most it shows. */
const SEO_DESCRIPTION = 250;
const AI_DESCRIPTION = 80;
/** Reviews to aim for when there are too few similar businesses to compare with, and the fewest ever asked for. */
const DEFAULT_REVIEW_TARGET = 10;
const MIN_REVIEW_TARGET = 3;
/** Google's own "4.0+" rating filter. */
const RATING_TARGET = 4;

/** How many reviews count as enough: what the typical similar business has, or a rule of thumb without peers. */
export function reviewTarget(peers: PeerReviews | null): number {
  return peers ? Math.max(MIN_REVIEW_TARGET, Math.round(peers.count)) : DEFAULT_REVIEW_TARGET;
}

const scoreOf = (checks: Check[]) => checks.reduce((sum, c) => sum + (c.done ? c.points : 0), 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const withArticle = (noun: string) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;

function basics(f: Facts) {
  const hasHours = WEEKDAYS.some((d) => f.hours[d] !== 'closed');
  const holidays = f.missingHolidays.length;
  const live = (publisherId: string) => f.listings.some((l) => l.publisherId === publisherId && l.live);
  return {
    hasHours,
    holidaysDone: hasHours && !holidays,
    holidaysDetail: holidays
      ? `${plural(holidays, 'public holiday')} in the next ${HOLIDAY_WINDOW_DAYS} days without hours: Google may show you as open.`
      : `Every public holiday in the next ${HOLIDAY_WINDOW_DAYS} days has hours.`,
    google: f.listings.find((l) => l.publisherId === 'GOOGLEMYBUSINESS'),
    live,
    description: f.description.trim(),
  };
}

/** 0–100: how much of what customers look for the profile has. */
export function profileReport(f: Facts): Report {
  const b = basics(f);
  const checks: Check[] = [
    {
      key: 'hours',
      label: 'Opening hours',
      detail: b.hasHours ? 'Customers can see when you are open.' : 'No opening hours yet.',
      done: b.hasHours,
      points: 25,
      fix: 'company',
    },
    {
      key: 'phone',
      label: 'Phone number',
      detail: f.phone || 'No phone number: customers can’t call you from Google.',
      done: !!f.phone.trim(),
      points: 15,
      fix: 'company',
    },
    {
      key: 'description',
      label: 'Description',
      detail: b.description ? 'Says what you offer.' : 'No description of what you offer.',
      done: b.description.length >= 10,
      points: 15,
      fix: 'company',
    },
    {
      key: 'holidays',
      label: 'Holiday hours',
      detail: b.holidaysDetail,
      done: b.holidaysDone,
      points: 15,
      fix: 'suggestions',
    },
    {
      key: 'website',
      label: 'Website',
      detail: f.website || 'No website: a link to your menu or booking page gets you more clicks.',
      done: !!f.website.trim(),
      points: 10,
      fix: 'company',
    },
    {
      key: 'address',
      label: 'Address',
      detail: f.addressLine1 || 'No street address: customers can’t find their way to you.',
      done: !!f.addressLine1.trim(),
      points: 10,
      fix: 'company',
    },
    {
      key: 'google',
      label: 'Live on Google',
      detail: b.google?.live ? 'Your profile shows on Google Search and Maps.' : 'Not live on Google yet.',
      done: !!b.google?.live,
      points: 10,
    },
  ];
  return { score: scoreOf(checks), checks };
}

/** Local search: what Google weighs for the map results (relevance and prominence) and what makes people click. */
export function searchReport(f: Facts): Report {
  const b = basics(f);
  const mentionsCity = b.description.toLowerCase().includes(f.city.toLowerCase());
  const checks: Check[] = [
    {
      key: 'category',
      label: 'Business category',
      detail: !f.categorySet
        ? 'No category, so Google can’t match you to searches like "lunch near me".'
        : f.categoryGuessed
          ? `A category is set in Yext. Connecta AI reads you as ${withArticle(f.category.toLowerCase())} from your name.`
          : `Listed as ${f.category.toLowerCase()}, so you show up for those searches.`,
      done: f.categorySet,
      points: 10,
    },
    {
      key: 'description',
      label: 'Description with detail',
      detail:
        b.description.length >= SEO_DESCRIPTION
          ? `${b.description.length} characters. Google shows up to 750.`
          : b.description
            ? `${b.description.length} characters. Write at least ${SEO_DESCRIPTION} on what you offer; Google shows up to 750.`
            : `No description yet. Write at least ${SEO_DESCRIPTION} characters on what you offer; Google shows up to 750.`,
      done: b.description.length >= SEO_DESCRIPTION,
      points: 15,
      fix: 'company',
    },
    {
      key: 'city',
      label: `Mentions ${f.city}`,
      detail: mentionsCity
        ? `Your description names ${f.city}, which helps local searches.`
        : `Say where you are: people search "${f.category.toLowerCase()} ${f.city.toLowerCase()}".`,
      done: mentionsCity,
      points: 10,
      fix: 'company',
    },
    {
      key: 'hours',
      label: 'Opening hours',
      detail: b.hasHours
        ? 'Set, so you appear in "open now" searches.'
        : 'Missing: Google leaves you out of "open now" searches.',
      done: b.hasHours,
      points: 15,
      fix: 'company',
    },
    {
      key: 'holidays',
      label: 'Holiday hours',
      detail: b.holidaysDetail,
      done: b.holidaysDone,
      points: 10,
      fix: 'suggestions',
    },
    {
      key: 'website',
      label: 'Website link',
      detail: f.website || 'No website: a link to your menu or booking page gets you more clicks.',
      done: !!f.website.trim(),
      points: 10,
      fix: 'company',
    },
    {
      key: 'phone',
      label: 'Phone number',
      detail: f.phone || 'No phone: the Call button doesn’t show.',
      done: !!f.phone.trim(),
      points: 10,
      fix: 'company',
    },
    {
      key: 'reviews',
      label: 'Reviews',
      detail: reviewsDetail(f),
      done: f.reviews.count >= reviewTarget(f.peerReviews) && f.reviews.averageRating >= RATING_TARGET,
      points: 15,
    },
    // The dataset's listings don't say whether the owner's account is linked, so then only being live counts.
    b.google?.needsAccount === null
      ? {
          key: 'google',
          label: 'Live on Google',
          detail: b.google.live ? 'Your profile shows on Google Search and Maps.' : 'Not live on Google yet.',
          done: b.google.live,
          points: 5,
        }
      : {
          key: 'google',
          label: 'Google account linked',
          detail: !b.google?.live
            ? 'Not live on Google yet.'
            : b.google.needsAccount
              ? 'Live, but your own Google account isn’t linked, so you can’t reply to reviews there.'
              : 'Live and linked.',
          done: !!b.google?.live && !b.google.needsAccount,
          points: 5,
        },
  ];
  return { score: scoreOf(checks), checks };
}

function reviewsDetail(f: Facts): string {
  const target = reviewTarget(f.peerReviews);
  const peers = f.peerReviews
    ? `The typical ${f.category.toLowerCase()} in your country has ${plural(Math.round(f.peerReviews.count), 'review')} (the median across ${f.peerReviews.businesses}), ${f.peerReviews.averageRating.toFixed(1)} ★ on average.`
    : `${target} or more at ${RATING_TARGET} ★ help ranking.`;
  if (!f.reviews.count) return `No reviews yet. ${peers}`;
  const yours = `${plural(f.reviews.count, 'review')}, ${f.reviews.averageRating.toFixed(1)} ★ on average.`;
  return `${yours} ${peers}${f.peerReviews ? ` Aim for ${target} at ${RATING_TARGET} ★ or better.` : ''}`;
}

// Where assistants read business data from.
const ASSISTANTS = [
  { publisherId: 'GOOGLEMYBUSINESS', site: 'Google', assistants: 'Gemini and Google AI Overviews' },
  { publisherId: 'BING', site: 'Bing', assistants: 'ChatGPT search and Microsoft Copilot' },
  { publisherId: 'APPLE', site: 'Apple Maps', assistants: 'Siri' },
];

export type Answer = { question: string; answer: string; known: boolean };

/** Date, weekday and HH:MM where the business is. */
function localNow(now: Date, timezone: string): { date: string; weekday: Weekday; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    weekday: part('weekday').toLowerCase() as Weekday,
    time: `${part('hour')}:${part('minute')}`,
  };
}

const intervalsOf = (hours: string) =>
  hours === 'closed'
    ? []
    : hours.split(',').map((i) => {
        const [open = '', close = ''] = i.split('-');
        return { open, close };
      });

/**
 * Whether the business is open now, and if not, when it next opens. Null when it has no opening hours. `holiday` is
 * true when today's hours are a special day's, as Google marks them.
 */
export type Opening =
  | { open: true; until: string; holiday: boolean }
  | { open: false; day: Weekday; today: boolean; at: string; holiday: boolean }
  | null;

/** Days ahead to look for the next opening: a week, plus a holiday or two on the way. */
const OPENING_LOOKAHEAD_DAYS = 14;

export function opening(
  hours: Record<Weekday, string>,
  timezone: string,
  now: Date,
  special: { date: string; hours: string }[] = [],
): Opening {
  const { date, weekday, time } = localNow(now, timezone);
  const byDate = new Map(special.map((s) => [s.date, s.hours]));
  const start = WEEKDAYS.indexOf(weekday);
  const dayAt = (i: number) => {
    const day = WEEKDAYS[(start + i) % 7]!;
    const exception = byDate.get(shiftDate(date, i));
    return { day, hours: exception ?? hours[day], holiday: exception !== undefined };
  };
  const today = dayAt(0);
  const current = intervalsOf(today.hours).find((i) => time >= i.open && time < i.close);
  if (current) return { open: true, until: current.close, holiday: today.holiday };
  for (let i = 0; i < OPENING_LOOKAHEAD_DAYS; i++) {
    const { day, hours: text } = dayAt(i);
    const next = intervalsOf(text).find((x) => i > 0 || time < x.open);
    if (next) return { open: false, day, today: i === 0, at: next.open, holiday: today.holiday };
  }
  return null;
}

const dayName = (day: Weekday) => `${day.charAt(0).toUpperCase()}${day.slice(1)}`;

/** How Google's result puts it: "Open · Closes 14:30", "Closed · Opens Wed 10:30". */
export function openingLine(o: Opening): string {
  if (!o) return 'No opening hours';
  const line = o.open
    ? `Open · Closes ${o.until}`
    : `Closed · Opens ${o.today ? '' : `${dayName(o.day).slice(0, 3)} `}${o.at}`;
  return o.holiday ? `${line} · Holiday hours` : line;
}

function openNowAnswer(f: Facts, now: Date): string {
  const o = opening(f.hours, f.timezone, now, f.holidayHours);
  if (o?.open) return `Yes, it’s open until ${o.until} today.`;
  if (!o) return 'No, it’s closed right now.';
  return `No, it’s closed right now. It opens ${o.today ? 'today' : `on ${dayName(o.day)}`} at ${o.at}.`;
}

/** AI assistants answer questions about local businesses from listing data: what they can say, and what's missing. */
export function aiReport(f: Facts, now = new Date()): Report & { answers: Answer[] } {
  const b = basics(f);
  const year = now.getUTCFullYear();
  const christmasDate =
    now.getUTCMonth() === 11 && now.getUTCDate() > 25 ? `${year + 1}-12-25` : `${year}-12-25`;
  const christmas = f.holidayHours.find((h) => h.date === christmasDate);
  const firstSentence = b.description.match(/^[^.!?]+[.!?]/)?.[0] ?? b.description;

  const answers: Answer[] = [
    {
      question: `Is ${f.name} open right now?`,
      answer: b.hasHours ? openNowAnswer(f, now) : `I couldn’t find opening hours for ${f.name}.`,
      known: b.hasHours,
    },
    {
      question: `Is ${f.name} open on Christmas Day?`,
      answer: christmas
        ? christmas.hours === 'closed'
          ? 'It’s closed on Christmas Day.'
          : `It’s open ${formatHours(christmas.hours)} on Christmas Day.`
        : 'I’m not sure. No holiday hours are listed, so it may follow its normal hours.',
      known: !!christmas,
    },
    {
      question: `What kind of place is ${f.name}?`,
      answer: b.description
        ? firstSentence
        : `I only know it’s ${withArticle(f.category.toLowerCase())} in ${f.city}.`,
      known: !!b.description,
    },
    {
      question: `How do I contact ${f.name}?`,
      answer:
        f.phone || f.website
          ? `${[f.phone && `Call ${f.phone}`, f.website && `visit ${f.website}`].filter(Boolean).join(' or ')}.`
          : 'I couldn’t find a phone number or website.',
      known: !!(f.phone || f.website),
    },
    {
      question: `Is ${f.name} any good?`,
      answer: f.reviews.count
        ? `It has ${plural(f.reviews.count, 'review')}, averaging ${f.reviews.averageRating.toFixed(1)} stars.`
        : 'I couldn’t find any reviews yet.',
      known: f.reviews.count > 0,
    },
  ];

  const checks: Check[] = [
    {
      key: 'hours',
      label: 'Opening hours',
      detail: 'Assistants answer "is it open?" straight from your hours.',
      done: b.hasHours,
      points: 20,
      fix: 'company',
    },
    {
      key: 'holidays',
      label: 'Holiday hours',
      detail: f.missingHolidays.length
        ? `${plural(f.missingHolidays.length, 'public holiday')} missing: an assistant may say you’re open when you’re not.`
        : `Set for the next ${HOLIDAY_WINDOW_DAYS} days.`,
      done: b.holidaysDone,
      points: 15,
      fix: 'suggestions',
    },
    {
      key: 'description',
      label: 'What you offer, in words',
      detail:
        b.description.length >= AI_DESCRIPTION
          ? 'Assistants can describe you in their own words.'
          : 'Too short for an assistant to say what you offer. Two or three sentences are enough.',
      done: b.description.length >= AI_DESCRIPTION,
      points: 20,
      fix: 'company',
    },
    {
      key: 'contact',
      label: 'Phone and website',
      detail: 'So an assistant can tell people how to reach you.',
      done: !!(f.phone.trim() && f.website.trim()),
      points: 10,
      fix: 'company',
    },
    ...ASSISTANTS.map((a): Check => ({
      key: `site:${a.publisherId}`,
      label: `Listed on ${a.site}`,
      detail: b.live(a.publisherId)
        ? `${a.assistants} can find you.`
        : `${a.assistants} read ${a.site}, and you’re not live there yet.`,
      done: b.live(a.publisherId),
      points: 8,
    })),
    {
      key: 'reviews',
      label: 'Reviews',
      detail: f.reviews.count
        ? 'Assistants quote your rating.'
        : 'Assistants recommend places with reviews first.',
      done: f.reviews.count >= 5,
      points: 11,
    },
  ];
  return { score: scoreOf(checks), checks, answers };
}

/** Where the dataset's Connect sends business data for AI assistants directly, besides the three sites. */
const AI_FEED = 'CHATGPT_SEARCH';

export type AssistantSource = {
  site: string;
  assistants: string;
  /** The listing's status there: live, waiting, opted out, or not listed at all. */
  status: 'live' | 'waiting' | 'opted out' | 'not listed';
};

/** Each source assistants read, with the business's listing status there. */
export function assistantSources(listings: ListingSite[]): AssistantSource[] {
  const statusOf = (publisherId: string): AssistantSource['status'] => {
    const found = listings.find((l) => l.publisherId === publisherId);
    if (!found) return 'not listed';
    if (found.live) return 'live';
    return found.status === 'OPTED_OUT' ? 'opted out' : 'waiting';
  };
  const feed = listings.find((l) => l.publisherId === AI_FEED);
  return [
    ...ASSISTANTS.map((a) => ({ site: a.site, assistants: a.assistants, status: statusOf(a.publisherId) })),
    ...(feed
      ? [{ site: 'AI feed', assistants: 'ChatGPT and other assistants', status: statusOf(AI_FEED) }]
      : []),
  ];
}

/** Assistants that read a site the business is live on. */
export function assistantsReached(listings: ListingSite[]): string[] {
  return assistantSources(listings)
    .filter((a) => a.status === 'live')
    .map((a) => a.assistants);
}

/** The missing item worth the most points, preferring one the owner can fix in the app. */
export function nextStep(checks: Check[]): Check | undefined {
  return checks
    .filter((c) => !c.done)
    .sort((a, b) => b.points - a.points || Number(!!b.fix) - Number(!!a.fix))[0];
}

export const pointsToGain = (checks: Check[]) => checks.reduce((sum, c) => sum + (c.done ? 0 : c.points), 0);

const HOUR = 3600;
const DAY = 86_400;

/** "1 hour", "6 hours", "1 day", "3 days". */
export function formatDuration(seconds: number): string {
  if (seconds <= HOUR) return '1 hour';
  if (seconds < DAY) return `${Math.ceil(seconds / HOUR)} hours`;
  const days = Math.ceil(seconds / DAY);
  return days === 1 ? '1 day' : `${days} days`;
}

/** "Updates within an hour", "Updates within 3 days". */
export function updateSpeed(seconds: number | null): string {
  if (seconds === null) return 'Update speed not known';
  if (seconds <= HOUR) return 'Updates within an hour';
  if (seconds <= DAY) return 'Updates within a day';
  return `Updates within ${formatDuration(seconds)}`;
}

export type SpeedGroup = { label: string; sites: ListingSite[] };

/** Sites with a known speed first, fastest first. */
export const bySpeed = (a: { seconds: number | null }, b: { seconds: number | null }) =>
  (a.seconds ?? Number.POSITIVE_INFINITY) - (b.seconds ?? Number.POSITIVE_INFINITY);

/** Live sites by how soon a change shows there. Sites without a known speed get their own group, if any. */
export function speedGroups(listings: ListingSite[]): SpeedGroup[] {
  const live = listings.filter((l) => l.live).sort(bySpeed);
  const within = (test: (s: number) => boolean) => live.filter((l) => l.seconds !== null && test(l.seconds));
  const unknown = live.filter((l) => l.seconds === null);
  return [
    { label: 'Within an hour', sites: within((s) => s <= HOUR) },
    { label: 'Within a day', sites: within((s) => s > HOUR && s <= DAY) },
    { label: 'Within a few days', sites: within((s) => s > DAY) },
    ...(unknown.length ? [{ label: 'Speed not known', sites: unknown }] : []),
  ];
}

/** The numbers the Listings tab leads with. */
export function listingsSummary(listings: ListingSite[]) {
  const live = listings.filter((l) => l.live);
  const known = live.flatMap((l) => (l.seconds === null ? [] : [l.seconds]));
  const reportsAccounts = listings.some((l) => l.needsAccount !== null);
  return {
    live: live.length,
    total: listings.length,
    /** Null when no listing says whether the owner's account is linked. */
    needsAccount: reportsAccounts ? listings.filter((l) => l.needsAccount).length : null,
    /** Listed but not live: waiting for the site, or opted out. */
    notLive: listings.length - live.length,
    /** How long until a change shows on every live site with a known speed: the slowest of them. */
    slowestSeconds: Math.max(0, ...known),
    /** Live sites with no known update speed, left out of `slowestSeconds`. */
    unknownSpeed: live.length - known.length,
  };
}

const missing = (report: Report) => report.checks.filter((c) => !c.done).length;

/** What needs the owner on each Visibility tab: sites not live yet, and missing search and AI items. */
export function visibilityCounts(presence: { listings: ListingSite[]; search: Report; ai: Report }) {
  return {
    listings: presence.listings.filter((l) => !l.live).length,
    seo: missing(presence.search),
    ai: missing(presence.ai),
  };
}

/** Missing items on the business profile. */
export const profileMissing = (profile: Report) => missing(profile);
