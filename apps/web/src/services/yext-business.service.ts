import 'server-only';
import { eq } from 'drizzle-orm';
import { category, city, countries, entity, languages, type EntityHours, type Language } from '~/db/schema';
import { db } from '~/server/db';
import { accountEntities, getEntity, type YextEntity } from '~/server/yext';

// Businesses from the team's Yext account. They show up in the business search next to the dataset's, and taking one
// on copies it into `entity`, so the dashboard and the predictor treat it like any other business. Changes to it go to
// the real Yext API.

type Country = (typeof countries)[number];
const isCountry = (code: string | undefined): code is Country => countries.some((c) => c === code);
const LANGUAGE_OF: Record<Country, Language> = { FI: 'fi', SE: 'sv', NO: 'nb' };
const TIMEZONE_OF: Record<Country, string> = {
  FI: 'Europe/Helsinki',
  SE: 'Europe/Stockholm',
  NO: 'Europe/Oslo',
};

/** Lower case without Nordic letters' marks, so "kipina" finds "Kahvila Kipinä". */
export const fold = (text: string) =>
  text.toLowerCase().replaceAll('ä', 'a').replaceAll('ö', 'o').replaceAll('å', 'a').replaceAll('ø', 'o');

/** Account businesses whose name, street or city contain every word, for the business search. */
export async function searchYextBusinesses(words: string[]) {
  const entities = await accountEntities();
  return entities
    .filter((e) => !e.closed && isCountry(e.meta.countryCode))
    .filter((e) => {
      const text = fold(`${e.name} ${e.address?.line1 ?? ''} ${e.address?.city ?? ''}`);
      return words.every((w) => text.includes(w));
    })
    .map((e) => ({
      id: e.meta.id,
      name: e.name,
      address: e.address?.line1 ?? '',
      city: e.address?.city ?? '',
      source: 'yext' as const,
    }));
}

/**
 * Copies the account's business into `entity`, or refreshes the copy. True when the business is there afterwards:
 * when Yext can't be reached, an earlier copy still counts.
 */
export async function syncYextBusiness(id: string): Promise<boolean> {
  const [existing] = await db.select({ split: entity.split }).from(entity).where(eq(entity.id, id));
  // A dataset business with the same id is never overwritten.
  if (existing && existing.split !== 'yext') return false;
  const found = await getEntity('yext', id);
  const row = found && (await toRow(found));
  if (!row) return !!existing;
  const { id: _, ...values } = row;
  await db.insert(entity).values(row).onConflictDoUpdate({ target: entity.id, set: values });
  return true;
}

async function toRow(e: YextEntity): Promise<typeof entity.$inferInsert | null> {
  const country = e.meta.countryCode;
  if (!isCountry(country)) return null;
  const place = await cityFor(e, country);
  if (!place) return null;
  const segment = await guessSegment(e);
  const language = e.meta.language === 'no' ? 'nb' : e.meta.language;
  const at = e.geocodedCoordinate ?? e.yextDisplayCoordinate;
  return {
    id: e.meta.id,
    uid: `yext-${e.meta.uid}`,
    accountId: e.meta.accountId,
    folderId: e.meta.folderId ?? '0',
    entityType: e.meta.entityType,
    labels: e.meta.labels ?? [],
    country,
    language: languages.find((l) => l === language) ?? LANGUAGE_OF[country],
    snapshotAt: new Date().toISOString().slice(0, 10),
    name: e.name,
    addressLine1: e.address?.line1 ?? '',
    city: place.name,
    postalCode: e.address?.postalCode ?? '',
    latitude: at?.latitude ?? place.lat,
    longitude: at?.longitude ?? place.lon,
    mainPhone: e.mainPhone ?? '',
    websiteUrl: e.websiteUrl?.url ?? '',
    categoryId: segment.id,
    segment: segment.segment,
    timezone: e.timezone ?? TIMEZONE_OF[country],
    // A new entity has no hours until someone enters them. Missing days read as closed.
    hours: e.hours ?? ({} as EntityHours),
    closed: !!e.closed,
    connectProduct: 'Yext',
    connectCustomerSince: (e.meta.createdTimestamp ?? new Date().toISOString()).slice(0, 10),
    shoppingCentreId: null,
    entityRole: null,
    split: 'yext',
  };
}

/** The dataset's city of the same name, or else the nearest one: the predictor compares businesses by city size. */
async function cityFor(e: YextEntity, country: Country) {
  const cities = await db.select().from(city).where(eq(city.country, country));
  const named = fold(e.address?.city ?? '');
  const same = cities.find((c) => fold(c.name) === named);
  if (same) return same;
  const at = e.geocodedCoordinate ?? e.yextDisplayCoordinate;
  if (!at) return null;
  const distance = (c: (typeof cities)[number]) =>
    (c.lat - at.latitude) ** 2 + ((c.lon - at.longitude) * Math.cos((at.latitude * Math.PI) / 180)) ** 2;
  return cities.reduce<(typeof cities)[number] | null>(
    (best, c) => (!best || distance(c) < distance(best) ? c : best),
    null,
  );
}

// Fonecta's own category ids in Yext aren't the dataset's, so the type is guessed from the business's name and
// description: the dataset's type names in four languages, plus these words.
const MORE_WORDS: Record<string, string[]> = {
  lunch_restaurant: ['lunch', 'lounas', 'lunsj', 'buffet'],
  cafe: ['coffee', 'kahvi', 'kaffe'],
  restaurant: ['ravintola', 'bistro', 'grill', 'sushi'],
  pizzeria: ['pizza', 'kebab'],
  bar_pub: ['pub', 'bar', 'baari'],
  hair_salon: ['parturi', 'barber', 'kampaamo'],
  gym: ['fitness', 'kuntosali'],
};
// When nothing matches. A guess either way: it decides which similar businesses the predictor compares with.
const FALLBACK_SEGMENT = 'restaurant';

async function guessSegment(e: YextEntity) {
  const categories = await db.select().from(category);
  const name = fold(e.name);
  const description = fold(e.description ?? '');
  const has = (text: string, word: string) =>
    new RegExp(`(^|[^\\p{L}\\d])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\d])`, 'u').test(
      text,
    );

  let best = categories.find((c) => c.segment === FALLBACK_SEGMENT) ?? categories[0]!;
  let bestScore = 0;
  for (const c of categories) {
    if (c.segment === 'shopping_centre') continue;
    const words = [c.nameFi, c.nameSv, c.nameNb, c.nameEn, ...(MORE_WORDS[c.segment] ?? [])].map(fold);
    // The name says more than the description.
    const score = words.reduce((sum, w) => sum + (has(name, w) ? 3 : 0) + (has(description, w) ? 1 : 0), 0);
    if (score > bestScore) [best, bestScore] = [c, score];
  }
  return best;
}
