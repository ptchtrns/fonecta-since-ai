import 'server-only';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { businessSource, calendarSpecialDay, type SourceKind } from '~/db/schema';
import { err, ok } from '~/lib/result';
import { isPublicUrl, readHours } from '~/lib/source-reader';
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

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, '').toLowerCase();

/** What kind of page an address is, so a warning can say "Your Facebook page says…". */
function kindOf(url: string, website: string): SourceKind {
  const host = hostOf(url);
  if (host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.com') return 'facebook';
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
  if (website && isPublicUrl(withScheme(website)) && host === hostOf(withScheme(website))) return 'website';
  return 'other';
}

/** The owner's list of addresses, with a scheme and without repeats, or the first one that isn't a public page. */
export function normalizeLinks(links: string[]) {
  const urls = [...new Set(links.filter(Boolean).map(withScheme))];
  const invalid = urls.find((url) => !isPublicUrl(url));
  return invalid ? err({ reason: 'InvalidUrl' as const, url: invalid }) : ok(urls);
}

/** Reads a page and keeps what it says, for a new link or one read again. */
async function readSource(business: Business, url: string) {
  const page = await readPage(url, business.country);
  const row = {
    kind: kindOf(url, business.website),
    url,
    status: page.status,
    findings: page.findings,
    checkedAt: new Date(),
  };
  await db
    .insert(businessSource)
    .values({ entityId: business.id, ...row })
    .onConflictDoUpdate({ target: [businessSource.entityId, businessSource.url], set: row });
  return page;
}

export const listLinkedSources = (entityId: string) =>
  db.select().from(businessSource).where(eq(businessSource.entityId, entityId));

/**
 * Makes the linked pages exactly `urls` (from `normalizeLinks`): removes the others and reads the new ones. Pages
 * already linked keep what was read from them; the nightly run reads them again.
 */
export async function setLinkedSources(business: Business, urls: string[]) {
  const linked = await listLinkedSources(business.id);
  const removed = linked.filter((s) => !urls.includes(s.url)).map((s) => s.url);
  const added = urls.filter((url) => !linked.some((s) => s.url === url));
  if (removed.length) {
    await db
      .delete(businessSource)
      .where(and(eq(businessSource.entityId, business.id), inArray(businessSource.url, removed)));
  }
  const pages = await Promise.all(added.map((url) => readSource(business, url)));
  return {
    added: added.length,
    removed: removed.length,
    unreadable: pages.filter((p) => p.status === 'unreachable').length,
  };
}

/** Reads every linked page again, so new dates on them get compared. Part of the nightly run. */
export async function recheckSources(business: Business) {
  const sources = await listLinkedSources(business.id);
  for (const source of sources) {
    await readSource(business, source.url);
  }
}
