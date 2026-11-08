import 'server-only';
import { and, eq } from 'drizzle-orm';
import { publisherSuggestion, publisherSuggestionAnswer, type EditAnswer } from '~/db/schema';
import { err, ok } from '~/lib/result';
import { db } from '~/server/db';
import { answerPublisherSuggestion, updateEntity, waitingPublisherSuggestions } from '~/server/yext';
import {
  getBusiness,
  liveSites,
  parseContent as parse,
  withSuggestedHours,
} from '~/services/business.service';
import { syncYextBusiness } from '~/services/yext-business.service';

// Edits that Google users and other sites suggested to the listing, answered by the owner.
// - The Yext account's businesses: the answer goes to Yext's Publisher Suggestions API, which applies an accepted
//   change itself and sends it on to every site.
// - The dataset's businesses: the mock has no such endpoint, so an accepted change to the hours is written to the
//   entity like any other change (to the mock when it's connected), and the answer is kept here.
// "Closed for good" is never applied from here: like the predictor's closure question, a person at Fonecta checks
// before a listing is taken down.

type Edit = { id: string; fieldName: string; suggestedContent: unknown };

/** Ids of the edits this business's owner already answered here. */
export async function answeredEditIds(entityId: string) {
  const rows = await db
    .select({ id: publisherSuggestionAnswer.suggestionId })
    .from(publisherSuggestionAnswer)
    .where(eq(publisherSuggestionAnswer.entityId, entityId));
  return new Set(rows.map((r) => r.id));
}

async function findWaiting(entityId: string, source: 'dataset' | 'yext', id: string): Promise<Edit | null> {
  if ((await answeredEditIds(entityId)).has(id)) return null;
  if (source === 'yext') {
    const found = (await waitingPublisherSuggestions('yext', entityId))?.find((s) => s.id === id);
    return found ? { id, fieldName: found.fieldName, suggestedContent: parse(found.suggestedContent) } : null;
  }
  const [row] = await db
    .select({
      fieldName: publisherSuggestion.fieldName,
      suggestedContent: publisherSuggestion.suggestedContent,
    })
    .from(publisherSuggestion)
    .where(
      and(
        eq(publisherSuggestion.id, id),
        eq(publisherSuggestion.entityId, entityId),
        eq(publisherSuggestion.status, 'WAITING_ON_CUSTOMER'),
      ),
    );
  return row ? { id, fieldName: row.fieldName, suggestedContent: parse(row.suggestedContent) } : null;
}

export type EditOutcome = 'published' | 'saved' | 'rejected' | 'closure';

/** The owner accepts or rejects one suggested edit. */
export async function answerEdit(entityId: string, id: string, accept: boolean) {
  const business = await getBusiness(entityId);
  if (!business) return err({ reason: 'NotFound' as const });
  const edit = await findWaiting(entityId, business.source, id);
  if (!edit) return err({ reason: 'NotFound' as const });

  const status: EditAnswer = accept ? 'ACCEPTED' : 'REJECTED';
  const closure = edit.fieldName === 'closed' && accept;
  let published = false;
  if (business.source === 'yext' && !closure) {
    const result = await answerPublisherSuggestion('yext', id, status);
    if (result.error) return err({ reason: 'YextRejected' as const, message: result.error });
    published = result.sent && accept;
  } else if (accept && edit.fieldName === 'hours') {
    // On top of the hours Yext (the mock) has now, since it replaces the whole hours object.
    const result = await updateEntity(business.source, entityId, {}, (now) =>
      withSuggestedHours(now, edit.suggestedContent),
    );
    if (result.error) return err({ reason: 'YextRejected' as const, message: result.error });
    published = result.sent;
  }

  await db
    .insert(publisherSuggestionAnswer)
    .values({
      entityId,
      suggestionId: id,
      status,
      fieldName: edit.fieldName,
      suggestedContent: edit.suggestedContent,
      publishedAt: published ? new Date() : null,
    })
    .onConflictDoNothing();
  if (business.source === 'yext' && published) await syncYextBusiness(entityId);

  const outcome: EditOutcome = closure ? 'closure' : !accept ? 'rejected' : published ? 'published' : 'saved';
  return ok({ outcome, sites: published ? await liveSites(business) : null });
}
