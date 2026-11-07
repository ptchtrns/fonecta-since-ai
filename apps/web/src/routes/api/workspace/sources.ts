import { linkSourceSchema } from '~/schemas/business.schema';
import {
  currentUser,
  json,
  notFound,
  readJson,
  unauthorized,
  validationFailed,
  type ApiEvent,
} from '~/server/http';
import { getBusiness } from '~/services/business.service';
import { linkSource } from '~/services/sources.service';

/** Links a page and reads it, or reads a linked one again. */
export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  const business = user.entityId ? await getBusiness(user.entityId) : null;
  if (!business) return notFound('Choose your business first');

  const validation = linkSourceSchema.safeParse(await readJson(event.request));
  if (!validation.success) return validationFailed(validation.error, linkSourceSchema);

  const [error, page] = await linkSource(business, validation.data);
  if (error) return json({ fieldErrors: { url: 'Use the address of a public web page' } }, 400);

  const found = Object.keys(page.findings).length;
  return json({
    message:
      page.status === 'unreachable'
        ? "Linked, but we couldn't read that page. Some sites block automatic reading."
        : found
          ? `Linked. Found hours for ${found} ${found === 1 ? 'day' : 'days'}.`
          : 'Linked. No opening hours for specific days on that page yet.',
  });
}
