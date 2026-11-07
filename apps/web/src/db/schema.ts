import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`)
    .$onUpdate(() => new Date()),
};

// Better Auth core tables. Field names must match what the drizzle adapter expects.
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  // The business this account manages. Not a foreign key: reseeding the dataset empties `entity` and refills it
  // with the same ids, and that shouldn't sign anyone out of their business.
  entityId: text('entity_id'),
  ...timestamps,
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    ...timestamps,
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// App tables

export const upload = sqliteTable(
  'upload',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    key: text('key').notNull().unique(),
    fileName: text('file_name').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    ...timestamps,
  },
  (t) => [index('upload_user_id_idx').on(t.userId)],
);

export const jobStatuses = ['queued', 'running', 'done', 'failed'] as const;
export type JobStatus = (typeof jobStatuses)[number];

// Work queue polled by apps/worker.
export const job = sqliteTable(
  'job',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    status: text('status', { enum: jobStatuses }).notNull().default('queued'),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    result: text('result', { mode: 'json' }).$type<Record<string, unknown>>(),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    claimedAt: integer('claimed_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    ...timestamps,
  },
  (t) => [index('job_status_created_idx').on(t.status, t.createdAt)],
);

// Connect Suggests dataset (data/fonecta-connect-suggests-2026, see docs/DATA_DICTIONARY.md there).
// Filled by apps/web/scripts/import_connect_data.py.
//
// Dates are 'YYYY-MM-DD' and times are 'YYYY-MM-DDTHH:MM[:SS]' text. The source times are local to each
// business with no offset, so they stay as text rather than becoming epochs. Only review times, which are
// epoch ms in the source, use timestamp_ms.

const countries = ['FI', 'SE', 'NO'] as const;
export const languages = ['fi', 'sv', 'nb', 'en'] as const;
export type Language = (typeof languages)[number];
/** How pressing a suggestion is. See `importanceLabel`. */
export const importances = ['low', 'medium', 'high'] as const;
const contactChannels = ['EMAIL', 'SMS', 'WHATSAPP', 'APP_PUSH'] as const;
const entitySplits = ['dev', 'test', 'demo', 'reference'] as const;
const cityTiers = ['capital', 'large_city', 'town', 'ski_resort'] as const;
const dayTypes = [
  'PUBLIC_HOLIDAY',
  'EVE',
  'OBSERVANCE',
  'COMMERCIAL',
  'BETWEEN_HOLIDAYS',
  'LOCAL_EVENT',
  'SCHOOL_BREAK',
] as const;

export type OpenInterval = { start: string; end: string };
export type DayHours = { isClosed?: boolean; openIntervals?: OpenInterval[] };
export type HolidayHours = DayHours & { date: string; isRegularHours?: boolean };
export type WeekHours = Record<
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
  DayHours
>;
// Yext hours object. Kept whole because a write-back has to PUT the full object.
export type EntityHours = WeekHours & { holidayHours?: HolidayHours[]; reopenDate?: string };
export type ReviewComment = {
  id: number;
  publisherDate: number;
  authorName: string;
  authorRole: string;
  content: string;
  visibility: string;
};

// Lookups and context

export const city = sqliteTable('city', {
  name: text('name').primaryKey(),
  country: text('country', { enum: countries }).notNull(),
  lat: real('lat').notNull(),
  lon: real('lon').notNull(),
  cityTier: text('city_tier', { enum: cityTiers }).notNull(),
});

export const category = sqliteTable('category', {
  id: text('id').primaryKey(),
  segment: text('segment').notNull().unique(),
  nameFi: text('name_fi').notNull(),
  nameSv: text('name_sv').notNull(),
  nameNb: text('name_nb').notNull(),
  nameEn: text('name_en').notNull(),
  archetype: text('archetype').notNull(),
});

export const calendarSpecialDay = sqliteTable(
  'calendar_special_day',
  {
    country: text('country', { enum: countries }).notNull(),
    date: text('date').notNull(),
    weekday: text('weekday').notNull(),
    dayKey: text('day_key').notNull(),
    dayClass: text('day_class').notNull(),
    dayType: text('day_type', { enum: dayTypes }).notNull(),
    nameLocal: text('name_local').notNull(),
    nameEn: text('name_en').notNull(),
    officialPublicHoliday: integer('official_public_holiday', { mode: 'boolean' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.country, t.date] }), index('calendar_special_day_date_idx').on(t.date)],
);

export const schoolBreak = sqliteTable(
  'school_break',
  {
    country: text('country', { enum: countries }).notNull(),
    schoolYearStart: integer('school_year_start').notNull(),
    breakName: text('break_name', { enum: ['autumn', 'christmas'] }).notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    note: text('note'),
  },
  (t) => [primaryKey({ columns: [t.country, t.schoolYearStart, t.breakName] })],
);

export const weatherDaily = sqliteTable(
  'weather_daily',
  {
    city: text('city')
      .notNull()
      .references(() => city.name),
    country: text('country', { enum: countries }).notNull(),
    date: text('date').notNull(),
    tmeanC: real('tmean_c').notNull(),
    tminC: real('tmin_c').notNull(),
    tmaxC: real('tmax_c').notNull(),
    precipMm: real('precip_mm').notNull(),
    snowDepthCm: integer('snow_depth_cm').notNull(),
    isForecast: integer('is_forecast', { mode: 'boolean' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.city, t.date] })],
);

export const weatherNormal = sqliteTable(
  'weather_normal',
  {
    city: text('city')
      .notNull()
      .references(() => city.name),
    country: text('country', { enum: countries }).notNull(),
    month: integer('month').notNull(),
    day: integer('day').notNull(),
    tmeanNormalC: real('tmean_normal_c').notNull(),
    pSnowDepthGe10cm: real('p_snow_depth_ge_10cm').notNull(),
  },
  (t) => [primaryKey({ columns: [t.city, t.month, t.day] })],
);

export const localEvent = sqliteTable(
  'local_event',
  {
    id: text('id').primaryKey(),
    nameFi: text('name_fi').notNull(),
    nameSv: text('name_sv').notNull(),
    nameNb: text('name_nb').notNull(),
    nameEn: text('name_en').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    venueName: text('venue_name').notNull(),
    city: text('city')
      .notNull()
      .references(() => city.name),
    country: text('country', { enum: countries }).notNull(),
    lat: real('lat').notNull(),
    lon: real('lon').notNull(),
    keywords: text('keywords', { mode: 'json' }).$type<string[]>().notNull(),
    expectedAttendance: integer('expected_attendance').notNull(),
  },
  (t) => [index('local_event_city_start_idx').on(t.city, t.startTime)],
);

export const peerBenchmark = sqliteTable(
  'peer_benchmark',
  {
    country: text('country', { enum: countries }).notNull(),
    cityTier: text('city_tier', { enum: cityTiers }).notNull(),
    segment: text('segment')
      .notNull()
      .references(() => category.segment),
    dayKey: text('day_key').notNull(),
    nEntityDays: integer('n_entity_days').notNull(),
    shareNoExceptionEntered: real('share_no_exception_entered').notNull(),
    shareEnteredClosed: real('share_entered_closed').notNull(),
    shareEnteredSpecialHours: real('share_entered_special_hours').notNull(),
    shareEnteredRegular: real('share_entered_regular').notNull(),
    closedShareAmongEntered: real('closed_share_among_entered'),
    medianOpenSpecial: text('median_open_special'),
    medianCloseSpecial: text('median_close_special'),
  },
  (t) => [primaryKey({ columns: [t.country, t.cityTier, t.segment, t.dayKey] })],
);

// Businesses and shopping centres. `split` comes from data/splits.csv.
export const entity = sqliteTable(
  'entity',
  {
    id: text('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    accountId: text('account_id').notNull(),
    folderId: text('folder_id').notNull(),
    entityType: text('entity_type').notNull(),
    labels: text('labels', { mode: 'json' }).$type<string[]>().notNull(),
    country: text('country', { enum: countries }).notNull(),
    language: text('language', { enum: languages }).notNull(),
    snapshotAt: text('snapshot_at').notNull(),
    name: text('name').notNull(),
    addressLine1: text('address_line1').notNull(),
    city: text('city')
      .notNull()
      .references(() => city.name),
    postalCode: text('postal_code').notNull(),
    latitude: real('latitude').notNull(),
    longitude: real('longitude').notNull(),
    mainPhone: text('main_phone').notNull(),
    websiteUrl: text('website_url').notNull(),
    categoryId: text('category_id')
      .notNull()
      .references(() => category.id),
    segment: text('segment')
      .notNull()
      .references(() => category.segment),
    timezone: text('timezone').notNull(),
    hours: text('hours', { mode: 'json' }).$type<EntityHours>().notNull(),
    closed: integer('closed', { mode: 'boolean' }).notNull(),
    connectProduct: text('connect_product').notNull(),
    connectCustomerSince: text('connect_customer_since').notNull(),
    shoppingCentreId: text('shopping_centre_id').references((): AnySQLiteColumn => entity.id),
    entityRole: text('entity_role'),
    split: text('split', { enum: entitySplits }).notNull(),
  },
  (t) => [
    index('entity_country_idx').on(t.country),
    index('entity_city_idx').on(t.city),
    index('entity_segment_idx').on(t.segment),
    index('entity_split_idx').on(t.split),
    index('entity_shopping_centre_idx').on(t.shoppingCentreId),
  ],
);

export const customerContact = sqliteTable('customer_contact', {
  entityId: text('entity_id')
    .primaryKey()
    .references(() => entity.id),
  contactFirstName: text('contact_first_name').notNull(),
  preferredChannel: text('preferred_channel', { enum: contactChannels }).notNull(),
  preferredLanguage: text('preferred_language', { enum: languages }).notNull(),
  email: text('email').notNull(),
  mobile: text('mobile').notNull(),
  bestContactWindow: text('best_contact_window').notNull(),
  standingPermissionHolidays: integer('standing_permission_holidays', { mode: 'boolean' }).notNull(),
  optedOutOfSuggestions: integer('opted_out_of_suggestions', { mode: 'boolean' }).notNull(),
});

// History

// Several rows for one date are possible: the latest entered_at wins.
export const holidayHoursHistory = sqliteTable(
  'holiday_hours_history',
  {
    entityId: text('entity_id')
      .notNull()
      .references(() => entity.id),
    date: text('date').notNull(),
    enteredAt: text('entered_at').notNull(),
    dayKey: text('day_key').notNull(),
    holidayHours: text('holiday_hours', { mode: 'json' }).$type<HolidayHours>().notNull(),
    source: text('source', {
      enum: ['OWNER_UI', 'CONNECT_SUGGESTION', 'FONECTA_SUPPORT', 'API_INTEGRATION'],
    }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.entityId, t.date, t.enteredAt] })],
);

export const regularHoursHistory = sqliteTable(
  'regular_hours_history',
  {
    entityId: text('entity_id')
      .notNull()
      .references(() => entity.id),
    // A date, or the literal 'before-2024' for the first version.
    effectiveFrom: text('effective_from').notNull(),
    hours: text('hours', { mode: 'json' }).$type<WeekHours>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.entityId, t.effectiveFrom] })],
);

// Signals

export const publisherSuggestion = sqliteTable(
  'publisher_suggestion',
  {
    id: text('id').primaryKey(),
    publisherId: text('publisher_id').notNull(),
    entityId: text('entity_id')
      .notNull()
      .references(() => entity.id),
    dateCreated: text('date_created').notNull(),
    dateResolved: text('date_resolved'),
    fieldName: text('field_name', { enum: ['hours', 'closed'] }).notNull(),
    status: text('status', {
      enum: ['WAITING_ON_CUSTOMER', 'ACCEPTED', 'REJECTED', 'EXPIRED'],
    }).notNull(),
    resolvedBy: text('resolved_by', { enum: ['SYSTEM', 'USER'] }),
    originalContent: text('original_content', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    suggestedContent: text('suggested_content', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  },
  (t) => [index('publisher_suggestion_entity_idx').on(t.entityId, t.dateCreated)],
);

export const review = sqliteTable(
  'review',
  {
    id: integer('id').primaryKey(),
    entityId: text('entity_id')
      .notNull()
      .references(() => entity.id),
    accountId: text('account_id').notNull(),
    rating: integer('rating').notNull(),
    // Null where the source has an empty string (rating-only reviews).
    content: text('content'),
    authorName: text('author_name').notNull(),
    url: text('url'),
    publisherDate: integer('publisher_date', { mode: 'timestamp_ms' }).notNull(),
    publisherId: text('publisher_id').notNull(),
    lastYextUpdateTime: integer('last_yext_update_time', { mode: 'timestamp_ms' }).notNull(),
    status: text('status').notNull(),
    comments: text('comments', { mode: 'json' }).$type<ReviewComment[]>().notNull(),
  },
  (t) => [index('review_entity_date_idx').on(t.entityId, t.publisherDate)],
);

export const analyticsDaily = sqliteTable(
  'analytics_daily',
  {
    entityId: text('entity_id')
      .notNull()
      .references(() => entity.id),
    date: text('date').notNull(),
    googleSearchQueries: integer('google_search_queries').notNull(),
    googleSearchViews: integer('google_search_views').notNull(),
    googleMapViews: integer('google_map_views').notNull(),
    googleCustomerActions: integer('google_customer_actions').notNull(),
    googlePhoneCalls: integer('google_phone_calls').notNull(),
    profileViews: integer('profile_views').notNull(),
  },
  (t) => [primaryKey({ columns: [t.entityId, t.date] })],
);

export const listing = sqliteTable(
  'listing',
  {
    entityId: text('entity_id')
      .notNull()
      .references(() => entity.id),
    publisherId: text('publisher_id').notNull(),
    publisherName: text('publisher_name').notNull(),
    status: text('status', { enum: ['LIVE', 'OPTED_OUT', 'WAITING_ON_PUBLISHER'] }).notNull(),
    typicalUpdateSpeedSeconds: integer('typical_update_speed_seconds').notNull(),
    listingUrl: text('listing_url').notNull(),
  },
  (t) => [primaryKey({ columns: [t.entityId, t.publisherId] })],
);

export const pilotDecision = sqliteTable(
  'pilot_decision',
  {
    suggestionId: text('suggestion_id').primaryKey(),
    messageId: text('message_id').notNull(),
    entityId: text('entity_id')
      .notNull()
      .references(() => entity.id),
    date: text('date').notNull(),
    dayKey: text('day_key').notNull(),
    displayedBefore: text('displayed_before').notNull(),
    suggestedHours: text('suggested_hours').notNull(),
    basis: text('basis', {
      enum: ['LAST_YEAR_EXCEPTION', 'SHOPPING_CENTRE_HOURS', 'PEER_MAJORITY'],
    }).notNull(),
    channel: text('channel', { enum: contactChannels }).notNull(),
    language: text('language', { enum: languages }).notNull(),
    sentAt: text('sent_at').notNull(),
    decision: text('decision', { enum: ['ACCEPTED', 'EDITED', 'REJECTED', 'NO_RESPONSE'] }).notNull(),
    finalHours: text('final_hours'),
    decidedAt: text('decided_at'),
    ownerComment: text('owner_comment'),
    standingPermissionGranted: integer('standing_permission_granted', { mode: 'boolean' }).notNull(),
  },
  (t) => [
    index('pilot_decision_entity_idx').on(t.entityId, t.date),
    index('pilot_decision_message_idx').on(t.messageId),
  ],
);

// Evaluation. `season` says which file a row came from: 2026 (targets_2026) or 2025 (the back-test).

export const evaluationTarget = sqliteTable(
  'evaluation_target',
  {
    entityId: text('entity_id')
      .notNull()
      .references(() => entity.id),
    date: text('date').notNull(),
    season: integer('season').notNull(),
    dayKey: text('day_key').notNull(),
    dayType: text('day_type', { enum: dayTypes }).notNull(),
    eventId: text('event_id').references(() => localEvent.id),
    country: text('country', { enum: countries }).notNull(),
    split: text('split', { enum: entitySplits }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.entityId, t.date] }),
    index('evaluation_target_season_split_idx').on(t.season, t.split),
  ],
);

// What dev businesses really did on past special days, the only answers kept in the database. The predictor
// learns from it how each business type behaves, using only days before the snapshot and never a business's
// own answers for its guess. Everything else about the answers stays in the dataset's files.

export const devTruthHistory = sqliteTable(
  'dev_truth_history',
  {
    entityId: text('entity_id')
      .notNull()
      .references(() => entity.id),
    date: text('date').notNull(),
    dayKey: text('day_key').notNull(),
    eventId: text('event_id').references(() => localEvent.id),
    truthHours: text('truth_hours').notNull(),
    displayedHoursThatDay: text('displayed_hours_that_day').notNull(),
  },
  (t) => [primaryKey({ columns: [t.entityId, t.date] })],
);

// What apps/predictor decided for the 2026 season, saved by `run.py --save`. NO_ACTION days have no row.
// Reseeding the dataset deletes the rows through the cascade, so run the predictor again afterwards.

export const prediction = sqliteTable(
  'prediction',
  {
    entityId: text('entity_id')
      .notNull()
      .references(() => entity.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    dayKey: text('day_key').notNull(),
    action: text('action', { enum: ['SUGGEST', 'FLAG'] }).notNull(),
    shownHours: text('shown_hours').notNull(),
    // Null for a FLAG, which goes to a person instead of suggesting hours.
    hours: text('hours'),
    confidence: real('confidence'),
    reasons: text('reasons', { mode: 'json' }).$type<string[]>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.entityId, t.date] })],
);

// What owners did. These are app tables, so a reseed or a new predictor run leaves them alone, and the dataset's
// `entity` table stays as it came, which keeps the predictor's scoring runs unaffected by demo clicks.

export type BusinessEdits = Partial<{
  name: string;
  phone: string;
  website: string;
  addressLine1: string;
  postalCode: string;
  description: string;
  hours: WeekHours;
}>;

export const businessProfile = sqliteTable('business_profile', {
  entityId: text('entity_id').primaryKey(),
  // The owner's changes on top of the entity's own values.
  edits: text('edits', { mode: 'json' }).$type<BusinessEdits>().notNull(),
  whatsappPhone: text('whatsapp_phone'),
  whatsappLanguage: text('whatsapp_language', { enum: languages }).notNull().default('en'),
  whatsappOn: integer('whatsapp_on', { mode: 'boolean' }).notNull().default(false),
  // The least important suggestion that goes out on WhatsApp. Lower ones wait on the dashboard.
  whatsappMinImportance: text('whatsapp_min_importance', { enum: importances }).notNull().default('low'),
  // "Handle public holidays from now on without asking."
  standingPermission: integer('standing_permission', { mode: 'boolean' }).notNull().default(false),
  // WhatsApp only allows free-form messages within 24 hours of the owner's last message.
  lastInboundAt: integer('last_inbound_at', { mode: 'timestamp_ms' }),
  ...timestamps,
});

export const suggestionStatuses = ['pending', 'approved', 'edited', 'declined'] as const;
export type SuggestionStatus = (typeof suggestionStatuses)[number];
export const decisionChannels = ['dashboard', 'link', 'whatsapp', 'standing'] as const;
export type DecisionChannel = (typeof decisionChannels)[number];

/** What was suggested and why, kept with the decision: predictor runs replace the `prediction` rows. */
export type SuggestionSnapshot = {
  label: string;
  shown: string;
  suggested: string | null;
  confidence: number | null;
  reasons: string[];
};

// One row per suggestion that was sent or answered. `suggestionKey` is the prediction's date, or
// 'closed-for-good' for the single question about a business that may have shut down.
export const suggestionState = sqliteTable(
  'suggestion_state',
  {
    entityId: text('entity_id').notNull(),
    suggestionKey: text('suggestion_key').notNull(),
    // Secret in the owner's no-login link. It only grants answering this one suggestion.
    token: text('token').notNull().unique(),
    status: text('status', { enum: suggestionStatuses }).notNull().default('pending'),
    hours: text('hours'),
    via: text('via', { enum: decisionChannels }),
    snapshot: text('snapshot', { mode: 'json' }).$type<SuggestionSnapshot>().notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
    decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.entityId, t.suggestionKey] })],
);

export const sourceKinds = ['website', 'facebook', 'instagram', 'other'] as const;
export type SourceKind = (typeof sourceKinds)[number];

// Pages the owner linked. Each suggestion is compared with the hours found on them.
export const businessSource = sqliteTable(
  'business_source',
  {
    entityId: text('entity_id').notNull(),
    kind: text('kind', { enum: sourceKinds }).notNull(),
    url: text('url').notNull(),
    status: text('status', { enum: ['read', 'unreachable'] }).notNull(),
    // Date to hours as text ("closed", "10:00-15:00"), for the dates this page mentions.
    findings: text('findings', { mode: 'json' }).$type<Record<string, string>>().notNull(),
    checkedAt: integer('checked_at', { mode: 'timestamp_ms' }).notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.entityId, t.kind] })],
);

export type User = typeof user.$inferSelect;
export type Upload = typeof upload.$inferSelect;
export type Job = typeof job.$inferSelect;
