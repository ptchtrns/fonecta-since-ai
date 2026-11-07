import 'server-only';
import { and, asc, desc, eq, inArray, isNotNull, ne, sql, type SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import {
  businessProfile,
  category,
  customerContact,
  entity,
  listing,
  suggestionState,
  user,
  type BusinessEdits,
  type EntityHours,
  type HolidayHours,
} from '~/db/schema';
import { WEEKDAYS, textToDay, weekToText } from '~/lib/hours';
import { ok, err } from '~/lib/result';
import type { BusinessEditPayload } from '~/schemas/business.schema';
import { db } from '~/server/db';
import { liveListings, updateEntity, type BusinessSource } from '~/server/yext';
import { fold, searchYextBusinesses, syncYextBusiness } from '~/services/yext-business.service';

const MAX_RESULTS = 20;

// SQLite's lower() only handles ASCII, so capitals are replaced as well.
const foldColumn = (column: AnySQLiteColumn): SQL =>
  sql`replace(replace(replace(replace(replace(replace(lower(${column}), 'ä', 'a'), 'Ä', 'a'), 'ö', 'o'), 'Ö', 'o'), 'å', 'a'), 'ø', 'o')`;

const selectable = and(ne(entity.split, 'reference'), eq(entity.closed, false));

/**
 * The combobox on the sign-up form: the Yext account's businesses first, then the dataset's. An empty search lists
 * the account's businesses and the dataset's demo businesses.
 */
export async function searchBusinesses(q: string) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  // Copies of the account's businesses are in `entity` too, but Yext has the current names.
  const fromYext = (await searchYextBusinesses(words)).slice(0, MAX_RESULTS);
  const matches = words.map((word) => {
    const like = `%${word.replace(/[%_\\]/g, '\\$&')}%`;
    return sql`(${foldColumn(entity.name)} LIKE ${like} ESCAPE '\\' OR ${foldColumn(entity.city)} LIKE ${like} ESCAPE '\\' OR ${foldColumn(entity.addressLine1)} LIKE ${like} ESCAPE '\\')`;
  });
  const rows = await db
    .select({
      id: entity.id,
      name: entity.name,
      address: entity.addressLine1,
      city: entity.city,
    })
    .from(entity)
    .where(
      and(selectable, ne(entity.split, 'yext'), ...(words.length ? matches : [eq(entity.split, 'demo')])),
    )
    .orderBy(desc(sql`${entity.split} = 'demo'`), asc(entity.name))
    .limit(MAX_RESULTS - fromYext.length);
  return ok([...fromYext, ...rows.map((r) => ({ ...r, source: 'dataset' as const }))]);
}

/** Whether an account can take on this business. One from the Yext account is copied in, or refreshed, here. */
export async function isSelectableBusiness(entityId: string) {
  const find = () =>
    db
      .select({ split: entity.split })
      .from(entity)
      .where(and(eq(entity.id, entityId), selectable));
  const [row] = await find();
  if (row && row.split !== 'yext') return true;
  if (!(await syncYextBusiness(entityId))) return false;
  return (await find()).length > 0;
}

/** The first time someone takes on a business: its settings start from what the dataset knows about the owner. */
export async function ensureProfile(entityId: string) {
  const [contact] = await db.select().from(customerContact).where(eq(customerContact.entityId, entityId));
  await db
    .insert(businessProfile)
    .values({
      entityId,
      edits: {},
      whatsappLanguage: contact?.preferredLanguage ?? 'en',
      standingPermission: contact?.standingPermissionHolidays ?? false,
    })
    .onConflictDoNothing();
}

export async function linkUserToBusiness(userId: string, entityId: string) {
  if (!(await isSelectableBusiness(entityId))) return err({ reason: 'NotFound' as const });
  await ensureProfile(entityId);
  await db.update(user).set({ entityId }).where(eq(user.id, userId));
  return ok({ entityId });
}

/** Holiday hours with the owner's approved days on top, in date order. */
export function withApproved(existing: HolidayHours[], approved: { date: string; hours: string }[]) {
  const days = new Map(existing.map((h) => [h.date, h]));
  for (const a of approved) days.set(a.date, { date: a.date, ...textToDay(a.hours) });
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The business as customers should see it: the dataset's values with the owner's edits on top. */
export async function getBusiness(entityId: string) {
  const business = await readBusiness(entityId);
  // A reseed removes businesses that came from Yext. They come back from Yext the next time someone needs them.
  if (business || !(await syncYextBusiness(entityId))) return business;
  return readBusiness(entityId);
}

async function readBusiness(entityId: string) {
  const [row] = await db
    .select({
      entity,
      categoryName: category.nameEn,
      profile: businessProfile,
      contactFirstName: customerContact.contactFirstName,
    })
    .from(entity)
    .innerJoin(category, eq(category.id, entity.categoryId))
    .leftJoin(businessProfile, eq(businessProfile.entityId, entity.id))
    .leftJoin(customerContact, eq(customerContact.entityId, entity.id))
    .where(eq(entity.id, entityId));
  if (!row) return null;

  const approved = await db
    .select({ date: suggestionState.suggestionKey, hours: suggestionState.hours })
    .from(suggestionState)
    .where(
      and(
        eq(suggestionState.entityId, entityId),
        inArray(suggestionState.status, ['approved', 'edited']),
        // A confirmed closure has no hours.
        isNotNull(suggestionState.hours),
      ),
    );
  const edits: BusinessEdits = row.profile?.edits ?? {};
  const e = row.entity;
  return {
    id: e.id,
    source: (e.split === 'yext' ? 'yext' : 'dataset') as BusinessSource,
    name: edits.name ?? e.name,
    category: row.categoryName,
    addressLine1: edits.addressLine1 ?? e.addressLine1,
    postalCode: edits.postalCode ?? e.postalCode,
    city: e.city,
    country: e.country,
    phone: edits.phone ?? e.mainPhone,
    website: edits.website ?? e.websiteUrl,
    description: edits.description ?? e.description ?? '',
    // Everything a write to Yext has to include, since it replaces the whole hours object.
    hours: {
      ...e.hours,
      ...edits.hours,
      holidayHours: withApproved(
        e.hours.holidayHours ?? [],
        approved.flatMap((a) => (a.hours ? [{ date: a.date, hours: a.hours }] : [])),
      ),
    } as EntityHours,
    timezone: e.timezone,
    owner: row.contactFirstName ?? e.name,
    shoppingCentreId: e.shoppingCentreId,
    segment: e.segment,
    whatsapp: {
      phone: row.profile?.whatsappPhone ?? '',
      language: row.profile?.whatsappLanguage ?? 'en',
      on: row.profile?.whatsappOn ?? false,
      minImportance: row.profile?.whatsappMinImportance ?? 'low',
      standingPermission: row.profile?.standingPermission ?? false,
      lastInboundAt: row.profile?.lastInboundAt ?? null,
    },
  };
}
export type Business = NonNullable<Awaited<ReturnType<typeof getBusiness>>>;

/** Sites the listing is live on, fastest first, with how long a change takes to show there. */
export async function liveSites(business: Pick<Business, 'id' | 'source'>) {
  // The dataset has listings for its own businesses. For the account's, Yext itself says where they show.
  if (business.source === 'yext') return (await liveListings('yext', business.id)) ?? [];
  return db
    .select({ name: listing.publisherName, seconds: listing.typicalUpdateSpeedSeconds })
    .from(listing)
    .where(and(eq(listing.entityId, business.id), eq(listing.status, 'LIVE')))
    .orderBy(asc(listing.typicalUpdateSpeedSeconds));
}

const withScheme = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

/** The owner's edit on the business card: publish what changed, then keep it on top of the dataset's values. */
export async function saveBusiness(entityId: string, input: BusinessEditPayload) {
  const current = await getBusiness(entityId);
  if (!current) return err({ reason: 'NotFound' as const });
  await ensureProfile(entityId);

  const hoursChanged = WEEKDAYS.some((d) => weekToText(current.hours)[d] !== input.hours[d]);
  const hours = Object.fromEntries(
    WEEKDAYS.map((d) => [d, textToDay(input.hours[d])]),
  ) as BusinessEdits['hours'];

  const body: Record<string, unknown> = {};
  if (input.name !== current.name) body.name = input.name;
  if (input.phone !== current.phone) body.mainPhone = input.phone.replace(/[^\d+]/g, '') || null;
  if (input.website !== current.website)
    body.websiteUrl = input.website ? { url: withScheme(input.website) } : null;
  if (input.description !== current.description) body.description = input.description || null;
  if (input.addressLine1 !== current.addressLine1 || input.postalCode !== current.postalCode) {
    body.address = {
      line1: input.addressLine1,
      postalCode: input.postalCode,
      city: current.city,
      countryCode: current.country,
    };
  }
  if (!hoursChanged && !Object.keys(body).length) return ok({ changed: false, published: false });

  // Yext replaces the whole hours object, so the new weekdays go on top of the hours Yext has now.
  const yext = await updateEntity(
    current.source,
    entityId,
    body,
    hoursChanged ? (now) => ({ ...now, ...hours }) : undefined,
  );
  if (yext.error) return err({ reason: 'YextRejected' as const, message: yext.error });
  // Yext keeps the account's businesses, so the copy here is refreshed instead of keeping edits on top of it.
  if (current.source === 'yext' && yext.sent) {
    await syncYextBusiness(entityId);
    return ok({ changed: true, published: true });
  }

  const edits: BusinessEdits = {
    name: input.name,
    phone: input.phone,
    website: input.website,
    addressLine1: input.addressLine1,
    postalCode: input.postalCode,
    description: input.description,
    ...(hoursChanged ? { hours } : {}),
  };
  const [profile] = await db.select().from(businessProfile).where(eq(businessProfile.entityId, entityId));
  await db
    .update(businessProfile)
    .set({ edits: { ...profile?.edits, ...edits } })
    .where(eq(businessProfile.entityId, entityId));
  return ok({ changed: true, published: yext.sent });
}
