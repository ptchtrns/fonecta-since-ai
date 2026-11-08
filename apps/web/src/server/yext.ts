import 'server-only';
import { env } from 'cloudflare:workers';
import type { EntityHours } from '~/db/schema';
import { levelFor, log } from '~/server/log';

// Yext is where Connect keeps a business's details, and it sends changes on to Google, Apple Maps, Bing and the rest.
//
// There are two Yext APIs here, because the dataset's businesses and the sandbox's are different businesses:
// - YEXT_API_URL + YEXT_API_KEY: the team's Yext sandbox (https://sbx-api.yextapis.com). Its businesses show up in
//   the business search, and theirs are the changes that really go to Yext.
// - YEXT_MOCK_URL: the dataset's mock (http://localhost:8787, see its mock_api), which knows the dataset's businesses.
// Without the one a business needs, a change is only saved here, and the UI says so instead of claiming it went live.

type Env = { YEXT_API_URL?: string; YEXT_API_KEY?: string; YEXT_MOCK_URL?: string };
const VERSION = '20261106';
const PAGE_SIZE = 50;

/** Where a business came from: the hackathon dataset, or the Yext account itself. */
export type BusinessSource = 'dataset' | 'yext';

type Connection = { url: string; key: string };

function connection(source: BusinessSource): Connection | null {
  const { YEXT_API_URL, YEXT_API_KEY, YEXT_MOCK_URL } = env as Env;
  const url = source === 'yext' ? YEXT_API_URL : YEXT_MOCK_URL;
  if (!url) return null;
  // The mock takes any key.
  const key = source === 'yext' ? YEXT_API_KEY : 'demo';
  if (!key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

/** Whether changes to this business's details go to Yext. */
export const publishes = (source: BusinessSource) => !!connection(source);

/** Whether the Yext account is connected, so its businesses can be found and taken on. */
export const yextAccountEnabled = () => !!connection('yext');

/** The parts of a Yext location entity Connect Suggests reads. */
export type YextEntity = {
  meta: {
    id: string;
    uid: string;
    accountId: string;
    folderId?: string;
    entityType: string;
    countryCode: string;
    language?: string;
    createdTimestamp?: string;
    labels?: string[];
  };
  name: string;
  address?: { line1?: string; city?: string; postalCode?: string; countryCode?: string };
  geocodedCoordinate?: { latitude: number; longitude: number };
  yextDisplayCoordinate?: { latitude: number; longitude: number };
  mainPhone?: string;
  websiteUrl?: { url?: string };
  description?: string;
  timezone?: string;
  /** Category ids per taxonomy, e.g. Fonecta's own: `{ fonecta: ['R21005287'] }`. */
  categories?: Record<string, string[]>;
  categoryIds?: string[];
  // A new entity has no hours at all until someone enters them.
  hours?: EntityHours;
  closed?: boolean;
};

type Response<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function call<T>(
  source: BusinessSource,
  method: 'GET' | 'PUT' | 'POST',
  path: string,
  { params = {}, body }: { params?: Record<string, string>; body?: unknown } = {},
): Promise<Response<T> | null> {
  const c = connection(source);
  if (!c) return null;
  const query = new URLSearchParams({ v: VERSION, ...params });
  const start = Date.now();
  try {
    const response = await fetch(`${c.url}/v2/accounts/me/${path}?${query}`, {
      method,
      headers: { 'api-key': c.key, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as {
      response?: T;
      meta?: { errors?: { message: string }[] };
    };
    log[levelFor(response.status)]('yext', `${method} ${path} ${response.status}`, {
      source,
      ms: Date.now() - start,
    });
    if (!response.ok)
      return {
        ok: false,
        status: response.status,
        error: result.meta?.errors?.[0]?.message ?? `HTTP ${response.status}`,
      };
    return { ok: true, data: result.response as T };
  } catch (error) {
    log.error('yext', `${method} ${path} failed`, { source, ms: Date.now() - start, error });
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

const entityPath = (id: string) => `entities/${encodeURIComponent(id)}`;

export async function getEntity(source: BusinessSource, id: string): Promise<YextEntity | null> {
  const result = await call<YextEntity>(source, 'GET', entityPath(id));
  return result?.ok ? result.data : null;
}

// The Management API has no free-text search, so the account's entities are read once and kept for a few minutes.
// A sandbox has a handful of them.
const CACHE_MS = 5 * 60_000;
const MAX_PAGES = 20;
let cache: { at: number; entities: YextEntity[] } | null = null;

/** Every location in the Yext account, or an empty list when it isn't connected or can't be reached. */
export async function accountEntities(): Promise<YextEntity[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.entities;
  const entities: YextEntity[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await call<{ entities: YextEntity[]; pageToken?: string }>('yext', 'GET', 'entities', {
      params: {
        limit: String(PAGE_SIZE),
        entityTypes: 'location',
        ...(pageToken ? { pageToken } : {}),
      },
    });
    if (!result?.ok) return cache?.entities ?? [];
    entities.push(...result.data.entities);
    pageToken = result.data.pageToken;
    if (!pageToken) break;
  }
  cache = { at: Date.now(), entities };
  return entities;
}

/** A site and how long a change takes to show there, or null when no figure is known. */
export type Site = { name: string; seconds: number | null };

// The sandbox returns publisher ids only, and no update speeds. These are the sites' display names; speeds come from
// the dataset's listings (`services/sites.service.ts`) for the sites it has.
const PUBLISHER_NAMES: Record<string, string> = {
  GOOGLEMYBUSINESS: 'Google (Search & Maps)',
  FACEBOOK: 'Facebook',
  BING: 'Bing',
  APPLE: 'Apple Maps',
  TRIPADVISOR: 'Tripadvisor',
  FOURSQUARE: 'Foursquare',
  HERE: 'HERE',
  TOMTOM: 'TomTom',
  MAPQUEST: 'MapQuest',
  NAVMII: 'Navmii',
  SHOWMELOCAL: 'ShowMeLocal',
  TUPALO: 'Tupalo',
  WHERETO: 'WhereTo',
};

/** A business's listing on one site. `additionalStatus` is NOT_CONNECTED when the owner's own account there isn't linked. */
export type YextListing = {
  publisherId: string;
  publisherName?: string;
  status: string;
  additionalStatus?: string;
  listingUrl?: string;
  typicalUpdateSpeedSeconds?: number;
};

const titleCase = (id: string) => id.charAt(0) + id.slice(1).toLowerCase();

/** A site's name from its publisher id. */
export const publisherName = (listing: Pick<YextListing, 'publisherId' | 'publisherName'>) =>
  listing.publisherName ?? PUBLISHER_NAMES[listing.publisherId] ?? titleCase(listing.publisherId);

/** Every listing of the business, live or not, or null when Yext can't say. */
export async function listings(source: BusinessSource, id: string): Promise<YextListing[] | null> {
  const result = await call<{ listings: YextListing[] }>(source, 'GET', 'listings/listings', {
    params: { locationIds: id },
  });
  return result?.ok ? result.data.listings : null;
}

export type YextReview = {
  id: number;
  publisherId: string;
  rating: number;
  content?: string;
  authorName?: string;
  publisherDate: number;
};

/** The business's reviews from every site Yext collects them from, or null when Yext can't say. */
export async function reviews(source: BusinessSource, id: string) {
  const result = await call<{ reviews: YextReview[]; averageRating: number; count: number }>(
    source,
    'GET',
    'reviews',
    { params: { entityIds: id, limit: '50' } },
  );
  return result?.ok ? result.data : null;
}

/** A change someone suggested on a site, such as a Google user's edit to the hours. */
export type YextPublisherSuggestion = {
  id: string;
  publisherId: string;
  dateCreated: string;
  fieldName: string;
  status: string;
  originalContent: unknown;
  suggestedContent: unknown;
};

/** Suggested edits waiting for the owner's answer, or null when Yext can't say. */
export async function waitingPublisherSuggestions(source: BusinessSource, id: string) {
  const result = await call<{ suggestions: YextPublisherSuggestion[] }>(
    source,
    'GET',
    'listings/publishersuggestions',
    { params: { locationIds: id, statuses: 'WAITING_ON_CUSTOMER' } },
  );
  return result?.ok ? result.data.suggestions : null;
}

export type YextResult = { sent: boolean; error?: string };

/**
 * Writes changed fields to the business in Yext. `changeHours` gets the hours Yext has now and returns the new ones:
 * Yext replaces the whole hours object, so starting from its own copy keeps whatever someone entered there that
 * isn't in this app (other holiday dates, or weekdays someone changed in Yext directly).
 */
export async function updateEntity(
  source: BusinessSource,
  id: string,
  fields: Record<string, unknown>,
  changeHours?: (current: EntityHours) => EntityHours,
): Promise<YextResult> {
  if (!connection(source)) return { sent: false };
  const body = { ...fields };
  if (changeHours) {
    const current = await call<YextEntity>(source, 'GET', entityPath(id));
    if (!current?.ok) return { sent: false, error: current?.error ?? 'Yext is not connected' };
    body.hours = changeHours(current.data.hours ?? ({} as EntityHours));
  }
  const result = await call<unknown>(source, 'PUT', entityPath(id), { body });
  if (!result?.ok) return { sent: false, error: result?.error ?? 'Yext is not connected' };
  if (source === 'yext') cache = null;
  return { sent: true };
}

/** One day of Google statistics, with Yext Analytics' metric names. */
export type YextAnalyticsDay = {
  date: string;
  GOOGLE_SEARCH_QUERIES?: number;
  GOOGLE_SEARCH_VIEWS?: number;
  GOOGLE_MAP_VIEWS?: number;
  GOOGLE_CUSTOMER_ACTIONS?: number;
  GOOGLE_PHONE_CALLS?: number;
  PROFILE_VIEWS?: number;
};

/** Daily Google statistics from Yext's Analytics API, or the error Yext gave. Null when it isn't connected. */
export async function analyticsReport(source: BusinessSource, id: string, from: string, to: string) {
  const result = await call<{ data: YextAnalyticsDay[] }>(source, 'POST', 'analytics/reports', {
    body: {
      metrics: [
        'GOOGLE_SEARCH_QUERIES',
        'GOOGLE_SEARCH_VIEWS',
        'GOOGLE_MAP_VIEWS',
        'GOOGLE_CUSTOMER_ACTIONS',
        'GOOGLE_PHONE_CALLS',
        'PROFILE_VIEWS',
      ],
      dimensions: ['DAYS'],
      filters: { entityIds: [id], startDate: from, endDate: to },
    },
  });
  if (!result) return null;
  return result.ok
    ? { ok: true as const, days: result.data?.data ?? [] }
    : { ok: false as const, error: result.error };
}

/**
 * Accepts or rejects a suggested edit in Yext. Accepting applies the change to the entity, and Yext sends it on to
 * every site. `sent` is false when Yext isn't connected.
 */
export async function answerPublisherSuggestion(
  source: BusinessSource,
  id: string,
  status: 'ACCEPTED' | 'REJECTED',
): Promise<YextResult> {
  if (!connection(source)) return { sent: false };
  const result = await call<unknown>(
    source,
    'PUT',
    `listings/publishersuggestions/${encodeURIComponent(id)}`,
    {
      params: { status },
      body: { status },
    },
  );
  if (!result?.ok) return { sent: false, error: result?.error ?? 'Yext is not connected' };
  return { sent: true };
}
