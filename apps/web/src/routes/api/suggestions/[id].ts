import { publishedSummary } from '~/lib/messages';
import { decideSchema, suggestionKeySchema } from '~/schemas/business.schema';
import {
  currentUser,
  json,
  notFound,
  publicOrigin,
  readJson,
  unauthorized,
  validationFailed,
  type ApiEvent,
} from '~/server/http';
import { getBusiness } from '~/services/business.service';
import { sendNext, usesOwnChannel } from '~/services/contact.service';
import { decide, FLAG_KEY } from '~/services/suggestions.service';

/** The owner answers a suggestion on the dashboard. */
export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return notFound('Choose your business first');

  const params = suggestionKeySchema.safeParse(event.params);
  if (!params.success) return notFound();
  const validation = decideSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, decideSchema);

  const [error, result] = await decide(user.entityId, params.data.id, validation.data, 'dashboard');
  if (error) {
    switch (error.reason) {
      case 'AlreadyAnswered':
        return json({ message: 'This one was already answered' }, 409);
      case 'HoursRequired':
        return json({ fieldErrors: { hours: 'Enter the hours' } }, 400);
      case 'YextRejected':
        return json({ message: `Google and the other sites didn't accept it: ${error.message}` }, 502);
      default:
        return notFound('This suggestion is no longer open');
    }
  }

  // The owner may have been waiting on this one in WhatsApp, Telegram or email too: move that conversation along.
  const business = await getBusiness(user.entityId);
  if (business && usesOwnChannel(business)) await sendNext(business, publicOrigin(event.request));

  const { decision } = result;
  return json({ message: decisionMessage(params.data.id, decision.status, decision.sites), data: decision });
}

function decisionMessage(key: string, status: string, sites: Parameters<typeof publishedSummary>[0]) {
  if (key === FLAG_KEY) {
    return status === 'declined'
      ? "Thanks, we won't ask again."
      : 'Thanks. A person at Fonecta will take it from here. Nothing changes on your listing until then.';
  }
  return status === 'declined' ? "Got it. We won't ask about this day again." : publishedSummary(sites);
}
