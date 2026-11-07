import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { entity, outbox } from '~/db/schema';
import { weekToText } from '~/lib/hours';
import { db } from '~/server/db';
import { whatsappEnabled } from '~/server/whatsapp';
import { publishes } from '~/server/yext';
import { getBusiness } from '~/services/business.service';
import { buildMessage, canContactNow, channelFor, sendable } from '~/services/contact.service';
import { builtInSources, listLinkedSources } from '~/services/sources.service';
import { listSuggestions, upcomingExceptions } from '~/services/suggestions.service';
import { syncYextBusiness } from '~/services/yext-business.service';

/** Everything the dashboard shows for one business, or null when it no longer exists. */
export async function getWorkspace(entityId: string, origin: string) {
  // A business from the Yext account shows what Yext has now, including changes made there directly.
  const [copy] = await db.select({ split: entity.split }).from(entity).where(eq(entity.id, entityId));
  if (copy?.split === 'yext') await syncYextBusiness(entityId);
  const business = await getBusiness(entityId);
  if (!business) return null;

  const [suggestions, exceptions, linked, builtIn, sent] = await Promise.all([
    listSuggestions(business),
    upcomingExceptions(business),
    listLinkedSources(entityId),
    builtInSources(business),
    db.select().from(outbox).where(eq(outbox.entityId, entityId)).orderBy(desc(outbox.createdAt)).limit(5),
  ]);

  // The message the owner would get next, to show on the Integrations page.
  const next = sendable(suggestions.pending, business.whatsapp.minImportance);
  const message = next ? await buildMessage(business, next, origin) : null;

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
      minImportance: business.whatsapp.minImportance,
      standingPermission: business.whatsapp.standingPermission,
      preview: message && {
        body: message.body,
        buttons: message.buttons.map((b) => b.title),
        url: message.url,
      },
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
