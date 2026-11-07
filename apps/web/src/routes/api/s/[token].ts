import { publishedSummary } from '~/lib/messages';
import { decideSchema, tokenSchema } from '~/schemas/business.schema';
import { json, notFound, readJson, validationFailed, type ApiEvent } from '~/server/http';
import { liveSites } from '~/services/business.service';
import { decide, findByToken, listSuggestions } from '~/services/suggestions.service';

// Public: the owner opens the link from their message. The unguessable token is the only credential, and it only
// grants answering this one suggestion.
export async function GET(event: ApiEvent) {
  const params = tokenSchema.safeParse(event.params);
  if (!params.success) return notFound('This link is not valid');

  const found = await findByToken(params.data.token);
  if (!found) return notFound('This link is not valid');

  const { state, business } = found;
  const { pending } = await listSuggestions(business);
  return json({
    data: {
      business: { name: business.name, owner: business.owner },
      date: state.suggestionKey,
      status: state.status,
      hours: state.hours,
      snapshot: state.snapshot,
      open: state.status !== 'pending' || pending.some((p) => p.key === state.suggestionKey),
      // Only what really went out: without a Yext connection a decision is saved, not published.
      sites: state.publishedAt ? await liveSites(business.id) : null,
    },
  });
}

export async function POST(event: ApiEvent) {
  const params = tokenSchema.safeParse(event.params);
  if (!params.success) return notFound('This link is not valid');
  const validation = decideSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, decideSchema);

  const found = await findByToken(params.data.token);
  if (!found) return notFound('This link is not valid');

  const [error, result] = await decide(
    found.state.entityId,
    found.state.suggestionKey,
    validation.data,
    'link',
  );
  if (error) {
    switch (error.reason) {
      case 'AlreadyAnswered':
        return json({ message: 'You already answered this one. Thanks!' }, 409);
      case 'HoursRequired':
        return json({ fieldErrors: { hours: 'Enter the hours' } }, 400);
      case 'YextRejected':
        return json({ message: `Google and the other sites didn't accept it: ${error.message}` }, 502);
      default:
        return notFound('This suggestion is no longer open');
    }
  }
  return json({ message: publishedSummary(result.decision.sites), data: result.decision });
}
