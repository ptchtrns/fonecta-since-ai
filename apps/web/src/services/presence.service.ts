import 'server-only';
import { and, desc, eq, gte, isNotNull, lte, ne, sql } from 'drizzle-orm';
import {
  calendarSpecialDay,
  entity,
  listing,
  publisherSuggestion,
  review,
  type HolidayHours,
} from '~/db/schema';
import { dayToText, formatDay, formatHours, shiftDate, WEEKDAYS, weekToText } from '~/lib/hours';
import {
  aiReport,
  HOLIDAY_WINDOW_DAYS,
  opening,
  openingLine,
  profileReport,
  searchReport,
  type Facts,
  type ListingSite,
  type PeerReviews,
  bySpeed,
} from '~/lib/visibility';
import { db } from '~/server/db';
import {
  getEntity,
  listings as yextListings,
  publisherName,
  reviews as yextReviews,
  waitingPublisherSuggestions,
} from '~/server/yext';
import type { Business } from '~/services/business.service';
import { answeredEditIds } from '~/services/edits.service';
import { siteWithSpeed, updateSpeeds } from '~/services/sites.service';
import { today } from '~/services/suggestions.service';

// Where the business shows up and what customers say about it. The dataset has listings, reviews and Google users'
// edits for its own businesses. For businesses from the Yext account, Yext itself is asked.

const RECENT_REVIEWS = 3;

// Shorter names than the publishers' own, and the name `PublisherLogo` knows each logo by.
const SITE_NAMES: Record<string, { name: string; logo?: string }> = {
  GOOGLEMYBUSINESS: { name: 'Google' },
  FONECTA_FINDER: { name: 'Finder.fi / Fonecta.fi', logo: 'Fonecta' },
  FONECTA_CALLER: { name: 'Fonecta Caller', logo: 'Fonecta' },
  WAZE: { name: 'Waze (via Google)', logo: 'Waze' },
  CHATGPT_SEARCH: { name: 'AI assistants (via Bing and Apple)' },
  FIRSTPARTY: { name: 'Your review page' },
};

/** A site's short name from its publisher id, for reviews and edits that only have the id. */
const siteName = (publisherId: string) => SITE_NAMES[publisherId]?.name ?? publisherName({ publisherId });

function toSite(raw: {
  publisherId: string;
  name: string;
  status: string;
  needsAccount: boolean | null;
  seconds: number | null;
}): ListingSite {
  const known = SITE_NAMES[raw.publisherId];
  const name = known?.name ?? raw.name;
  return {
    publisherId: raw.publisherId,
    name,
    logo: known?.logo ?? name,
    status: raw.status,
    live: raw.status === 'LIVE',
    needsAccount: raw.needsAccount,
    seconds: raw.seconds,
  };
}

/** Every site the business is listed on, live ones first and fastest first. */
async function listingsOf(business: Business): Promise<ListingSite[]> {
  const speeds = business.source === 'yext' ? await updateSpeeds() : new Map<string, number>();
  const raw =
    business.source === 'yext'
      ? ((await yextListings('yext', business.id)) ?? []).map((l) => ({
          publisherId: l.publisherId,
          status: l.status,
          needsAccount: l.additionalStatus === 'NOT_CONNECTED',
          ...siteWithSpeed(l, speeds),
        }))
      : (
          await db
            .select({
              publisherId: listing.publisherId,
              name: listing.publisherName,
              status: listing.status,
              seconds: listing.typicalUpdateSpeedSeconds,
            })
            .from(listing)
            .where(eq(listing.entityId, business.id))
        )
          // The dataset's listings don't say whether the owner's own account is linked.
          .map((l) => ({ ...l, needsAccount: null }));
  return raw.map(toSite).sort((a, b) => Number(b.live) - Number(a.live) || bySpeed(a, b));
}

/** Fewest similar businesses with reviews before their median is used as the target. */
const MIN_PEERS = 5;

/** The median review count and average rating among businesses of the same type in the same country. */
async function peerReviewsOf(business: Business): Promise<PeerReviews | null> {
  const rows = await db
    .select({
      count: sql<number>`count(${review.id})`,
      averageRating: sql<number | null>`avg(${review.rating})`,
    })
    .from(entity)
    .leftJoin(review, eq(review.entityId, entity.id))
    .where(
      and(
        eq(entity.segment, business.segment),
        eq(entity.country, business.country),
        ne(entity.id, business.id),
        // Only the dataset's own businesses: shopping centres and other Yext copies aren't peers.
        sql`${entity.split} not in ('reference', 'yext')`,
      ),
    )
    .groupBy(entity.id);
  const reviewed = rows.filter((r) => r.count > 0);
  if (reviewed.length < MIN_PEERS) return null;
  const counts = rows.map((r) => r.count).sort((a, b) => a - b);
  const mid = counts.length / 2;
  const median = counts.length % 2 ? counts[Math.floor(mid)]! : (counts[mid - 1]! + counts[mid]!) / 2;
  return {
    count: median,
    averageRating: reviewed.reduce((sum, r) => sum + (r.averageRating ?? 0), 0) / reviewed.length,
    businesses: rows.length,
  };
}

/**
 * Whether a category is set where the business is kept. The dataset's businesses have one. A Yext business's
 * category is Fonecta's own code, which this app can't name, so its type here is read from its name.
 */
async function categoryOf(business: Business) {
  if (business.source !== 'yext') return { categorySet: true, categoryGuessed: false };
  const found = await getEntity('yext', business.id);
  const ids = [...Object.values(found?.categories ?? {}).flat(), ...(found?.categoryIds ?? [])];
  return { categorySet: ids.length > 0, categoryGuessed: true };
}

export type RecentReview = { rating: number; content: string; author: string; date: string; site: string };

/** The latest reviews with words in them, with how many there are and their average rating. */
async function reviewsOf(business: Business) {
  if (business.source === 'yext') {
    const found = await yextReviews('yext', business.id);
    // Rating-only reviews have nothing to quote.
    const recent = (found?.reviews ?? [])
      .filter((r) => r.content)
      .sort((a, b) => b.publisherDate - a.publisherDate);
    return {
      count: found?.count ?? 0,
      averageRating: found?.averageRating ?? 0,
      recent: recent.slice(0, RECENT_REVIEWS).map((r): RecentReview => ({
        rating: r.rating,
        content: r.content ?? '',
        author: r.authorName ?? '',
        date: new Date(r.publisherDate).toISOString().slice(0, 10),
        site: siteName(r.publisherId),
      })),
    };
  }
  const [[summary], recent] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)`,
        averageRating: sql<number>`coalesce(avg(${review.rating}), 0)`,
      })
      .from(review)
      .where(eq(review.entityId, business.id)),
    db
      .select({
        rating: review.rating,
        content: review.content,
        author: review.authorName,
        date: review.publisherDate,
        publisherId: review.publisherId,
      })
      .from(review)
      .where(and(eq(review.entityId, business.id), isNotNull(review.content), ne(review.content, '')))
      .orderBy(desc(review.publisherDate))
      .limit(RECENT_REVIEWS),
  ]);
  return {
    count: summary?.count ?? 0,
    averageRating: summary?.averageRating ?? 0,
    recent: recent.map((r): RecentReview => ({
      rating: r.rating,
      content: r.content ?? '',
      author: r.author,
      date: r.date.toISOString().slice(0, 10),
      site: siteName(r.publisherId),
    })),
  };
}

/** A Google user's suggested edit, in words: "Thu 15 Oct 10:00–20:00" or "Closed for good". */
function describeEdit(field: string, content: unknown): string {
  const value = typeof content === 'string' ? safeParse(content) : content;
  if (field === 'closed') return value === true ? 'Closed for good' : 'Open again';
  if (!value || typeof value !== 'object') return 'Different hours';
  const hours = value as Partial<Record<(typeof WEEKDAYS)[number], unknown>> & {
    holidayHours?: HolidayHours[];
  };
  const days = (hours.holidayHours ?? []).map((h) => `${formatDay(h.date)} ${formatHours(dayToText(h))}`);
  const weekdays = WEEKDAYS.filter((d) => d in hours);
  if (weekdays.length) {
    const text = weekToText(hours as Parameters<typeof weekToText>[0]);
    days.push(...weekdays.map((d) => `${d.charAt(0).toUpperCase()}${d.slice(1, 3)} ${formatHours(text[d])}`));
  }
  return days.join(', ') || 'Different hours';
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export type GoogleEdit = {
  id: string;
  kind: 'hours' | 'closure';
  site: string;
  field: string;
  created: string;
  change: string;
};

/** Edits that Google users and other sites suggested, waiting for the owner's answer. */
async function googleEditsOf(business: Business): Promise<GoogleEdit[]> {
  const answered = await answeredEditIds(business.id);
  const rows =
    business.source === 'yext'
      ? ((await waitingPublisherSuggestions('yext', business.id)) ?? []).map((s) => ({
          id: s.id,
          publisherId: s.publisherId,
          fieldName: s.fieldName,
          dateCreated: s.dateCreated.slice(0, 10),
          suggestedContent: s.suggestedContent,
        }))
      : await db
          .select({
            id: publisherSuggestion.id,
            publisherId: publisherSuggestion.publisherId,
            fieldName: publisherSuggestion.fieldName,
            dateCreated: publisherSuggestion.dateCreated,
            suggestedContent: publisherSuggestion.suggestedContent,
          })
          .from(publisherSuggestion)
          .where(
            and(
              eq(publisherSuggestion.entityId, business.id),
              eq(publisherSuggestion.status, 'WAITING_ON_CUSTOMER'),
            ),
          )
          .orderBy(desc(publisherSuggestion.dateCreated));
  return rows
    .filter((r) => !answered.has(r.id))
    .map((r) => ({
      id: r.id,
      kind: r.fieldName === 'closed' ? ('closure' as const) : ('hours' as const),
      site: siteName(r.publisherId),
      field: r.fieldName,
      created: r.dateCreated,
      change: describeEdit(r.fieldName, r.suggestedContent),
    }));
}

/** Public holidays soon, on days the business is normally open, that have no hours entered. */
async function missingHolidaysOf(business: Business) {
  const from = today();
  const holidays = await db
    .select({ date: calendarSpecialDay.date, label: calendarSpecialDay.nameEn })
    .from(calendarSpecialDay)
    .where(
      and(
        eq(calendarSpecialDay.country, business.country),
        eq(calendarSpecialDay.officialPublicHoliday, true),
        gte(calendarSpecialDay.date, from),
        lte(calendarSpecialDay.date, shiftDate(from, HOLIDAY_WINDOW_DAYS)),
      ),
    )
    .orderBy(calendarSpecialDay.date);
  const entered = new Set((business.hours.holidayHours ?? []).map((h) => h.date));
  const week = weekToText(business.hours);
  const weekdayOf = (date: string) => WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]!;
  return holidays.filter((h) => !entered.has(h.date) && week[weekdayOf(h.date)] !== 'closed');
}

/** Listings, reviews, waiting edits and the three scores, for the front page, Visibility and Reports. */
export async function getPresence(business: Business) {
  const [listings, reviews, googleEdits, missingHolidays, peerReviews, category] = await Promise.all([
    listingsOf(business),
    reviewsOf(business),
    googleEditsOf(business),
    missingHolidaysOf(business),
    peerReviewsOf(business),
    categoryOf(business),
  ]);
  const from = today();
  const facts: Facts = {
    name: business.name,
    category: business.category,
    ...category,
    city: business.city,
    addressLine1: business.addressLine1,
    phone: business.phone,
    website: business.website,
    description: business.description,
    timezone: business.timezone,
    hours: weekToText(business.hours),
    holidayHours: (business.hours.holidayHours ?? [])
      .filter((h) => h.date >= from && !h.isRegularHours)
      .map((h) => ({ date: h.date, hours: dayToText(h) })),
    missingHolidays,
    listings,
    reviews,
    peerReviews,
  };
  return {
    listings,
    reviews,
    googleEdits,
    missingHolidays,
    profile: profileReport(facts),
    search: searchReport(facts),
    ai: aiReport(facts),
    /** For the preview of the Google result. */
    openingNow: openingLine(opening(facts.hours, facts.timezone, new Date(), facts.holidayHours)),
    peerReviews,
  };
}
