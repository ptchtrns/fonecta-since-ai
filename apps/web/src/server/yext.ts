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
  // A new entity has no hours at all until someone enters them.
  hours?: EntityHours;
  closed?: boolean;
};

type Response<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function call<T>(
  source: BusinessSource,
  method: 'GET' | 'PUT',
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

export type Site = { name: string; seconds: number };

// The sandbox returns publisher ids only. Names and update speeds match the dataset's listings where it has the
// publisher. For the rest the speed is a guess of three days.
const UNKNOWN_SPEED_SECONDS = 259_200;
const PUBLISHERS: Record<string, Site> = {
  GOOGLEMYBUSINESS: { name: 'Google (Search & Maps)', seconds: 120 },
  FACEBOOK: { name: 'Facebook', seconds: 600 },
  BING: { name: 'Bing', seconds: 86_400 },
  APPLE: { name: 'Apple Maps', seconds: 172_800 },
  TRIPADVISOR: { name: 'Tripadvisor', seconds: 259_200 },
  FOURSQUARE: { name: 'Foursquare', seconds: 604_800 },
  HERE: { name: 'HERE', seconds: UNKNOWN_SPEED_SECONDS },
  TOMTOM: { name: 'TomTom', seconds: UNKNOWN_SPEED_SECONDS },
  MAPQUEST: { name: 'MapQuest', seconds: UNKNOWN_SPEED_SECONDS },
  NAVMII: { name: 'Navmii', seconds: UNKNOWN_SPEED_SECONDS },
  SHOWMELOCAL: { name: 'ShowMeLocal', seconds: UNKNOWN_SPEED_SECONDS },
  TUPALO: { name: 'Tupalo', seconds: UNKNOWN_SPEED_SECONDS },
  WHERETO: { name: 'WhereTo', seconds: UNKNOWN_SPEED_SECONDS },
};

type RawListing = {
  publisherId: string;
  publisherName?: string;
  status: string;
  typicalUpdateSpeedSeconds?: number;
};

const titleCase = (id: string) => id.charAt(0) + id.slice(1).toLowerCase();

/** Sites the listing is live on according to Yext, fastest first, or null when Yext can't say. */
export async function liveListings(source: BusinessSource, id: string): Promise<Site[] | null> {
  const result = await call<{ listings: RawListing[] }>(source, 'GET', 'listings/listings', {
    params: { locationIds: id },
  });
  if (!result?.ok) return null;
  return result.data.listings
    .filter((l) => l.status === 'LIVE')
    .map((l) => {
      const known = PUBLISHERS[l.publisherId];
      return {
        name: l.publisherName ?? known?.name ?? titleCase(l.publisherId),
        seconds: l.typicalUpdateSpeedSeconds ?? known?.seconds ?? UNKNOWN_SPEED_SECONDS,
      };
    })
    .sort((a, b) => a.seconds - b.seconds);
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
