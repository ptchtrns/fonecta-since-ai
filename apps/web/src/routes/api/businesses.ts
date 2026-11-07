import { businessSearchSchema } from '~/schemas/business.schema';
import { json, validationFailed, type ApiEvent } from '~/server/http';
import { searchBusinesses } from '~/services/business.service';

// Public, because the sign-up form needs it before there's an account. Listings are public information anyway, and
// a search returns at most a handful of them.
export async function GET(event: ApiEvent) {
  const query = Object.fromEntries(new URL(event.request.url).searchParams);
  const validation = businessSearchSchema.safeParse(query);
  if (!validation.success) return validationFailed(validation.error, businessSearchSchema);

  const [, results] = await searchBusinesses(validation.data.q);
  return json({ data: results });
}
