import { businessEditSchema } from '~/schemas/business.schema';
import {
  currentUser,
  json,
  notFound,
  readJson,
  unauthorized,
  validationFailed,
  type ApiEvent,
} from '~/server/http';
import { getBusiness, saveBusiness } from '~/services/business.service';
import { normalizeLinks, setLinkedSources } from '~/services/sources.service';

const pages = (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`;

/** Saves the business's details, publishing them where it can, and the pages linked to it. */
export async function PATCH(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return notFound('Choose your business first');

  const validation = businessEditSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, businessEditSchema);
  // Checked before anything is saved, so a mistyped link doesn't leave the rest half saved.
  const [invalid, links] = normalizeLinks(validation.data.links);
  if (invalid)
    return json({ fieldErrors: { links: `Use the address of a public web page: ${invalid.url}` } }, 400);

  const [error, result] = await saveBusiness(user.entityId, validation.data);
  if (error) {
    return error.reason === 'YextRejected'
      ? json({ message: `Google and the other sites didn't accept it: ${error.message}` }, 502)
      : notFound();
  }
  const business = await getBusiness(user.entityId);
  if (!business) return notFound();
  const linked = await setLinkedSources(business, links);

  const parts = [
    !result.changed
      ? ''
      : result.published
        ? 'Saved and published.'
        : 'Saved. It goes live once publishing to Yext is connected.',
    linked.added ? `Linked ${pages(linked.added)}.` : '',
    linked.removed ? `Removed ${pages(linked.removed)}.` : '',
    linked.unreadable ? `Couldn't read ${pages(linked.unreadable)}: some sites block automatic reading.` : '',
  ].filter(Boolean);
  return json({ message: parts.length ? parts.join(' ') : 'Nothing to change' });
}
