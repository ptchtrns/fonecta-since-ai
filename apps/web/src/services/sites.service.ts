import 'server-only';
import { sql } from 'drizzle-orm';
import { listing } from '~/db/schema';
import { bySpeed } from '~/lib/visibility';
import { db } from '~/server/db';
import { publisherName, type Site, type YextListing } from '~/server/yext';

// How long a change takes to show on each site. Yext's Listings API doesn't say, so the figures are the dataset's:
// its listings carry each publisher's typical update speed. A site the dataset doesn't have gets no figure at all
// rather than a guess, and the UI says the speed isn't known.

const CACHE_MS = 10 * 60_000;
let cache: { at: number; speeds: Map<string, number> } | null = null;

/** Typical update speed per publisher id, from the dataset's listings. */
export async function updateSpeeds(): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.speeds;
  const rows = await db
    .select({
      publisherId: listing.publisherId,
      seconds: sql<number>`avg(${listing.typicalUpdateSpeedSeconds})`,
    })
    .from(listing)
    .groupBy(listing.publisherId);
  const speeds = new Map(rows.map((r) => [r.publisherId, Math.round(r.seconds)]));
  // An empty table (before the dataset is loaded) isn't worth keeping.
  if (speeds.size) cache = { at: Date.now(), speeds };
  return speeds;
}

/** The site a Yext listing is on, with its update speed when one is known. */
export function siteWithSpeed(l: YextListing, speeds: Map<string, number>): Site {
  return {
    name: publisherName(l),
    seconds: l.typicalUpdateSpeedSeconds ?? speeds.get(l.publisherId) ?? null,
  };
}

/** Sites a Yext business is live on, fastest first, sites without a known speed last. */
export async function liveYextSites(all: YextListing[]): Promise<Site[]> {
  const speeds = await updateSpeeds();
  return all
    .filter((l) => l.status === 'LIVE')
    .map((l) => siteWithSpeed(l, speeds))
    .sort(bySpeed);
}
