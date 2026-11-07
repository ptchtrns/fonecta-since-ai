import 'server-only';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  analyticsDaily,
  businessSource,
  calendarSpecialDay,
  evaluationTarget,
  localEvent,
  prediction,
  suggestionState,
  type DecisionChannel,
  type Language,
  type SuggestionSnapshot,
  type SuggestionStatus,
} from '~/db/schema';
import { daysBetween, dayToText, shiftDate } from '~/lib/hours';
import { importanceLabel, importanceScore, type Importance } from '~/lib/importance';
import { t } from '~/lib/messages';
import { err, ok } from '~/lib/result';
import type { DecidePayload } from '~/schemas/business.schema';
import { db } from '~/server/db';
import { putEntity, yextEnabled } from '~/server/yext';
import { getBusiness, liveSites, withApproved, type Business } from '~/services/business.service';

export const FLAG_KEY = 'closed-for-good';
export const today = () => new Date().toISOString().slice(0, 10);

/** What a page the owner linked says about a suggested day. */
export type SourceCheck = { kind: string; hours: string; agrees: boolean };

export type SuggestionItem = {
  key: string;
  kind: 'hours' | 'closure';
  date: string | null;
  label: string;
  /** The day's name for a message, per language. */
  dayNames: Record<Language, string>;
  shown: string;
  suggested: string | null;
  confidence: number | null;
  reasons: string[];
  /** Google search and map views on the same day last season, or an average day's when there's no such day. */
  views: number;
  score: number;
  importance: Importance;
  publicHoliday: boolean;
  checks: SourceCheck[];
  sentAt: Date | null;
};

type Row = Awaited<ReturnType<typeof predictionRows>>[number];

function predictionRows(business: Business) {
  return db
    .select({
      date: prediction.date,
      dayKey: prediction.dayKey,
      action: prediction.action,
      shown: prediction.shownHours,
      hours: prediction.hours,
      confidence: prediction.confidence,
      reasons: prediction.reasons,
      dayType: calendarSpecialDay.dayType,
      nameEn: calendarSpecialDay.nameEn,
      nameLocal: calendarSpecialDay.nameLocal,
      eventEn: localEvent.nameEn,
      eventFi: localEvent.nameFi,
      eventSv: localEvent.nameSv,
      eventNb: localEvent.nameNb,
    })
    .from(prediction)
    .leftJoin(
      calendarSpecialDay,
      and(eq(calendarSpecialDay.country, business.country), eq(calendarSpecialDay.date, prediction.date)),
    )
    .leftJoin(
      evaluationTarget,
      and(eq(evaluationTarget.entityId, prediction.entityId), eq(evaluationTarget.date, prediction.date)),
    )
    .leftJoin(localEvent, eq(localEvent.id, evaluationTarget.eventId))
    .where(and(eq(prediction.entityId, business.id), gte(prediction.date, today())))
    .orderBy(prediction.date);
}

const labelOf = (row: Row) => row.nameEn ?? row.eventEn ?? t('en').schoolBreak;

/** Calendar names are in the language of the business's country. Local events have all of them. */
const dayNamesOf = (row: Row): Record<Language, string> => ({
  en: labelOf(row),
  fi: row.nameLocal ?? row.eventFi ?? t('fi').schoolBreak,
  sv: row.nameLocal ?? row.eventSv ?? t('sv').schoolBreak,
  nb: row.nameLocal ?? row.eventNb ?? t('nb').schoolBreak,
});

/** Google views a suggestion's day had last season, per date in `rows`. */
async function viewsByDate(business: Business, rows: Row[]) {
  if (!rows.length) return new Map<string, number>();
  const firstDate = rows[0]!.date;
  const calendar = await db
    .select({ date: calendarSpecialDay.date, dayKey: calendarSpecialDay.dayKey })
    .from(calendarSpecialDay)
    .where(
      and(
        eq(calendarSpecialDay.country, business.country),
        gte(calendarSpecialDay.date, shiftDate(firstDate, -400)),
      ),
    );

  // A holiday's date last season comes from the calendar. Other days use the same weekday a year ago.
  const lastSeason = new Map<string, string>();
  for (const row of rows) {
    const earlier = calendar.find(
      (c) => c.dayKey === row.dayKey && c.date < row.date && daysBetween(c.date, row.date) > 300,
    );
    lastSeason.set(row.date, earlier?.date ?? shiftDate(row.date, -364));
  }

  const views = sql<number>`${analyticsDaily.googleSearchViews} + ${analyticsDaily.googleMapViews}`;
  const [found, [average]] = await Promise.all([
    db
      .select({ date: analyticsDaily.date, views })
      .from(analyticsDaily)
      .where(
        and(eq(analyticsDaily.entityId, business.id), inArray(analyticsDaily.date, [...lastSeason.values()])),
      ),
    db
      .select({
        views: sql<number>`avg(${analyticsDaily.googleSearchViews} + ${analyticsDaily.googleMapViews})`,
      })
      .from(analyticsDaily)
      .where(eq(analyticsDaily.entityId, business.id)),
  ]);
  const byDate = new Map(found.map((f) => [f.date, f.views]));
  return new Map(
    rows.map((row) => [row.date, byDate.get(lastSeason.get(row.date)!) ?? Math.round(average?.views ?? 0)]),
  );
}

async function allStates(entityId: string) {
  return db.select().from(suggestionState).where(eq(suggestionState.entityId, entityId));
}

/** The owner's list: waiting suggestions, most important first, and what has been answered, newest first. */
export async function listSuggestions(business: Business) {
  const [rows, states, sources] = await Promise.all([
    predictionRows(business),
    allStates(business.id),
    db.select().from(businessSource).where(eq(businessSource.entityId, business.id)),
  ]);
  const stateByKey = new Map(states.map((s) => [s.suggestionKey, s]));
  const pendingRows = rows.filter((r) => {
    const status = stateByKey.get(r.action === 'FLAG' ? FLAG_KEY : r.date)?.status;
    return !status || status === 'pending';
  });
  const views = await viewsByDate(business, pendingRows);
  const now = today();

  // The predictor flags a shut-down business on every date. To the owner that's one question.
  const flagged = pendingRows.find((r) => r.action === 'FLAG');
  const flagItem: SuggestionItem[] = flagged
    ? [
        {
          key: FLAG_KEY,
          kind: 'closure',
          date: null,
          label: 'Have you closed for good?',
          dayNames: dayNamesOf(flagged),
          shown: flagged.shown,
          suggested: null,
          confidence: null,
          reasons: flagged.reasons,
          views: views.get(flagged.date) ?? 0,
          score: Number.POSITIVE_INFINITY,
          importance: 'high',
          publicHoliday: false,
          checks: [],
          sentAt: stateByKey.get(FLAG_KEY)?.sentAt ?? null,
        },
      ]
    : [];

  const items = pendingRows
    .filter((r) => r.action === 'SUGGEST')
    .map((r) => {
      const confidence = r.confidence ?? 0;
      const dayViews = views.get(r.date) ?? 0;
      return {
        key: r.date,
        kind: 'hours' as const,
        date: r.date,
        label: labelOf(r),
        dayNames: dayNamesOf(r),
        shown: r.shown,
        suggested: r.hours,
        confidence,
        reasons: r.reasons,
        views: dayViews,
        score: importanceScore({ confidence, views: dayViews, daysUntil: daysBetween(now, r.date) }),
        publicHoliday: r.dayType === 'PUBLIC_HOLIDAY' || r.dayType === 'EVE',
        checks: sources.flatMap((source) => {
          const hours = source.findings[r.date];
          return hours ? [{ kind: source.kind, hours, agrees: hours === r.hours }] : [];
        }),
        sentAt: stateByKey.get(r.date)?.sentAt ?? null,
      };
    });
  const top = Math.max(0, ...items.map((i) => i.score));
  const ranked: SuggestionItem[] = items
    .map((i) => ({ ...i, importance: importanceLabel(i.score, top) }))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  const handled = states
    .filter((s) => s.status !== 'pending')
    .sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0))
    .map((s) => ({
      key: s.suggestionKey,
      status: s.status,
      hours: s.hours,
      via: s.via,
      decidedAt: s.decidedAt,
      publishedAt: s.publishedAt,
      snapshot: s.snapshot,
    }));

  return { pending: [...flagItem, ...ranked], handled };
}

const snapshotOf = (item: SuggestionItem): SuggestionSnapshot => ({
  label: item.label,
  shown: item.shown,
  suggested: item.suggested,
  confidence: item.confidence,
  reasons: item.reasons,
});

/** The suggestion's row, created when it's first sent or answered. Holds the token for the no-login link. */
export async function ensureState(entityId: string, item: SuggestionItem) {
  await db
    .insert(suggestionState)
    .values({
      entityId,
      suggestionKey: item.key,
      token: crypto.randomUUID().replaceAll('-', ''),
      snapshot: snapshotOf(item),
    })
    .onConflictDoNothing();
  const [state] = await db
    .select()
    .from(suggestionState)
    .where(and(eq(suggestionState.entityId, entityId), eq(suggestionState.suggestionKey, item.key)));
  return state!;
}

/** Upcoming exceptions for the business card, with holiday names. */
export async function upcomingExceptions(business: Business) {
  const days = (business.hours.holidayHours ?? []).filter((d) => d.date >= today() && !d.isRegularHours);
  if (!days.length) return [];
  const names = await db
    .select({ date: calendarSpecialDay.date, name: calendarSpecialDay.nameEn })
    .from(calendarSpecialDay)
    .where(eq(calendarSpecialDay.country, business.country));
  const nameOf = new Map(names.map((n) => [n.date, n.name]));
  return days.map((d) => ({ date: d.date, label: nameOf.get(d.date) ?? '', hours: dayToText(d) }));
}

export type Decision = {
  status: SuggestionStatus;
  hours: string | null;
  /** Where the change shows, or null when publishing isn't connected. */
  sites: { name: string; seconds: number }[] | null;
};

/** The owner's answer, from any channel. Nothing is published before this runs. */
export async function decide(entityId: string, key: string, input: DecidePayload, via: DecisionChannel) {
  const business = await getBusiness(entityId);
  if (!business) return err({ reason: 'NotFound' as const });
  const { pending } = await listSuggestions(business);
  const item = pending.find((p) => p.key === key);
  if (!item) {
    const [known] = await db
      .select({ status: suggestionState.status })
      .from(suggestionState)
      .where(and(eq(suggestionState.entityId, entityId), eq(suggestionState.suggestionKey, key)));
    return err({
      reason: known && known.status !== 'pending' ? ('AlreadyAnswered' as const) : ('NotFound' as const),
    });
  }
  if (input.action === 'edit' && !input.hours) return err({ reason: 'HoursRequired' as const });

  const status: SuggestionStatus =
    input.action === 'decline' ? 'declined' : input.action === 'edit' ? 'edited' : 'approved';
  const hours = status === 'declined' ? null : input.action === 'edit' ? input.hours! : item.suggested;
  // Confirming a closure goes to Fonecta's people, who take the listing down. It's never automatic.
  const publishes = item.kind === 'hours' && status !== 'declined';

  let published = false;
  if (publishes) {
    const result = await putEntity(entityId, {
      // The whole hours object: sending only holidayHours would risk wiping weekday hours on the real API.
      hours: {
        ...business.hours,
        holidayHours: withApproved(business.hours.holidayHours ?? [], [{ date: key, hours: hours! }]),
      },
    });
    if (result.error) return err({ reason: 'YextRejected' as const, message: result.error });
    published = result.sent;
  }

  await ensureState(entityId, item);
  const now = new Date();
  await db
    .update(suggestionState)
    // What was on the table when they answered: the predictor may suggest something else later.
    .set({
      status,
      hours,
      via,
      snapshot: snapshotOf(item),
      decidedAt: now,
      publishedAt: published ? now : null,
    })
    .where(and(eq(suggestionState.entityId, entityId), eq(suggestionState.suggestionKey, key)));

  const decision: Decision = {
    status,
    hours,
    sites: publishes && yextEnabled() ? await liveSites(entityId) : null,
  };
  return ok({ decision, item, business });
}

/** The no-login link's view of one suggestion. */
export async function findByToken(token: string) {
  const [state] = await db.select().from(suggestionState).where(eq(suggestionState.token, token));
  if (!state) return null;
  const business = await getBusiness(state.entityId);
  return business ? { state, business } : null;
}
