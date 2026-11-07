import 'server-only';
import { weekToText } from '~/lib/hours';
import { whatsappEnabled } from '~/server/whatsapp';
import { yextEnabled } from '~/server/yext';
import { getBusiness } from '~/services/business.service';
import { buildMessage } from '~/services/contact.service';
import { builtInSources, listLinkedSources } from '~/services/sources.service';
import { listSuggestions, upcomingExceptions } from '~/services/suggestions.service';

/** Everything the dashboard shows for one business, or null when it no longer exists. */
export async function getWorkspace(entityId: string, origin: string) {
  const business = await getBusiness(entityId);
  if (!business) return null;

  const [suggestions, exceptions, linked, builtIn] = await Promise.all([
    listSuggestions(business),
    upcomingExceptions(business),
    listLinkedSources(entityId),
    builtInSources(business),
  ]);

  // The message the owner would get next, to show on the Integrations page.
  const next = suggestions.pending.find((p) => p.kind === 'hours' && !p.checks.some((c) => !c.agrees));
  const message = next ? await buildMessage(business, next, origin) : null;

  return {
    business: {
      id: business.id,
      name: business.name,
      category: business.category,
      addressLine1: business.addressLine1,
      postalCode: business.postalCode,
      city: business.city,
      phone: business.phone,
      website: business.website,
      description: business.description,
      hours: weekToText(business.hours),
      exceptions,
    },
    suggestions,
    sources: {
      builtIn,
      linked: linked.map((s) => ({
        kind: s.kind,
        url: s.url,
        status: s.status,
        days: Object.keys(s.findings).length,
        checkedAt: s.checkedAt,
      })),
    },
    whatsapp: {
      configured: whatsappEnabled(),
      phone: business.whatsapp.phone,
      language: business.whatsapp.language,
      on: business.whatsapp.on,
      standingPermission: business.whatsapp.standingPermission,
      preview: message && {
        body: message.body,
        buttons: message.buttons.map((b) => b.title),
        url: message.url,
      },
    },
    publishing: yextEnabled(),
  };
}
export type WorkspaceData = NonNullable<Awaited<ReturnType<typeof getWorkspace>>>;
