import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { entity, outbox } from '~/db/schema';
import { weekToText } from '~/lib/hours';
import { db } from '~/server/db';
import { whatsappEnabled } from '~/server/whatsapp';
import { publishes } from '~/server/yext';
import { getBusiness } from '~/services/business.service';
import { canContactNow, channelFor, previewMessage, sendable } from '~/services/contact.service';
import { getPresence } from '~/services/presence.service';
import { listLinkedSources } from '~/services/sources.service';
import { listSuggestions, upcomingExceptions } from '~/services/suggestions.service';
import { syncYextBusiness } from '~/services/yext-business.service';

/** Everything the dashboard shows for one business, or null when it no longer exists. */
export async function getWorkspace(entityId: string, origin: string) {
  // A business from the Yext account shows what Yext has now, including changes made there directly.
  const [copy] = await db.select({ split: entity.split }).from(entity).where(eq(entity.id, entityId));
  if (copy?.split === 'yext') await syncYextBusiness(entityId);
  const business = await getBusiness(entityId);
  if (!business) return null;

  const [suggestions, exceptions, linked, presence, sent] = await Promise.all([
    listSuggestions(business),
    upcomingExceptions(business),
    listLinkedSources(entityId),
    getPresence(business),
    db.select().from(outbox).where(eq(outbox.entityId, entityId)).orderBy(desc(outbox.createdAt)).limit(5),
  ]);

  // The message the owner would get next, to show on the Integrations page.
  const next = sendable(suggestions.pending, business.whatsapp.minImportance);
  const preview = next ? await previewMessage(business, next, origin) : null;

  return {
    business: {
      id: business.id,
      source: business.source,
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
      // Pages the owner linked, oldest first, as they were added.
      links: linked
        .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((s) => ({
          url: s.url,
          status: s.status,
          days: Object.keys(s.findings).length,
          checkedAt: s.checkedAt,
        })),
    },
    suggestions,
    presence,
    whatsapp: {
      configured: whatsappEnabled(),
      phone: business.whatsapp.phone,
      language: business.whatsapp.language,
      on: business.whatsapp.on,
      minImportance: business.whatsapp.minImportance,
      standingPermission: business.whatsapp.standingPermission,
      preview,
    },
    contact: {
      optedOut: business.contact.optedOut,
      channel: channelFor(business),
      window: business.contact.window,
      timeZone: business.contact.timeZone,
      reachableNow: canContactNow(business),
      sent: sent.map((m) => ({ channel: m.channel, recipient: m.recipient, body: m.body, at: m.createdAt })),
    },
    publishing: publishes(business.source),
  };
}
export type WorkspaceData = NonNullable<Awaited<ReturnType<typeof getWorkspace>>>;
