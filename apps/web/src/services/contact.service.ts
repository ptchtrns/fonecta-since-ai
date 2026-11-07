import 'server-only';
import { and, eq } from 'drizzle-orm';
import {
  businessProfile,
  languages,
  outbox,
  suggestionState,
  user,
  type ContactChannel,
  type Language,
} from '~/db/schema';
import {
  confirmationMessage,
  localDay,
  localHours,
  suggestionButtons,
  suggestionMessage,
  t,
} from '~/lib/messages';
import { inContactWindow } from '~/lib/contact-window';
import { meetsImportance, type Importance } from '~/lib/importance';
import { err, ok } from '~/lib/result';
import type { ContactPayload, WhatsAppPayload } from '~/schemas/business.schema';
import { db } from '~/server/db';
import { log, maskPhone } from '~/server/log';
import { sendTestTemplate, sendWhatsApp, whatsappEnabled } from '~/server/whatsapp';
import { ensureProfile, getBusiness, type Business } from '~/services/business.service';
import { recheckSources } from '~/services/sources.service';
import { decide, ensureState, listSuggestions, type SuggestionItem } from '~/services/suggestions.service';

// Reaching the owner: one suggestion at a time, the most important first, and the next one only after they've
// answered, so nobody gets a pile of messages. Standing permission skips the question for public holidays.
// Every message respects the owner's preferences: nothing after an opt-out, only within their contact window, and on
// their channel. WhatsApp is sent for real; text messages, email and app notifications go to the outbox.

const WINDOW_MS = 24 * 60 * 60 * 1000;
// Linked pages are checked once a day, at this hour (UTC). Messages go out every hour, within each owner's window.
const PAGE_CHECK_HOUR_UTC = 5;
// Below this, or when a linked page disagrees, a suggestion waits for the owner even with standing permission.
const STANDING_MIN_CONFIDENCE = 0.7;

const disagrees = (item: SuggestionItem) => item.checks.some((c) => !c.agrees);

/**
 * The next suggestion to send: never a closure question, which is for a person, one a linked page disputes, or one
 * below the owner's level. `pending` is most important first.
 */
export const sendable = (pending: SuggestionItem[], min: Importance) =>
  pending.find(
    (item) =>
      item.kind === 'hours' && item.suggested && !disagrees(item) && meetsImportance(item.importance, min),
  );

export function suggestionUrl(origin: string, token: string) {
  return `${origin}/s/${token}`;
}

function compose(business: Business, item: SuggestionItem, url: string, token: string, language: Language) {
  return {
    body: suggestionMessage({
      owner: business.owner,
      dayName: item.dayNames[language],
      date: item.date!,
      shown: item.shown,
      suggested: item.suggested!,
      views: item.views,
      reasons: item.reasons,
      url,
      language,
    }),
    buttons: suggestionButtons(item.suggested!, token, language),
  };
}

/** The message as the owner gets it, in their language. */
export async function buildMessage(business: Business, item: SuggestionItem, origin: string) {
  const state = await ensureState(business.id, item);
  const url = suggestionUrl(origin, state.token);
  return { state, url, ...compose(business, item, url, state.token, business.whatsapp.language) };
}

/** The next message in every language, so the Integrations page can show it in the one the owner is picking. */
export async function previewMessage(business: Business, item: SuggestionItem, origin: string) {
  const state = await ensureState(business.id, item);
  const url = suggestionUrl(origin, state.token);
  const messages = Object.fromEntries(
    languages.map((language) => {
      const message = compose(business, item, url, state.token, language);
      return [language, { body: message.body, buttons: message.buttons.map((b) => b.title) }];
    }),
  ) as Record<Language, { body: string; buttons: string[] }>;
  return { url, messages };
}

const inWindow = (business: Business) =>
  !!business.whatsapp.lastInboundAt && Date.now() - business.whatsapp.lastInboundAt.getTime() < WINDOW_MS;

/** WhatsApp once the owner has turned it on here, otherwise the channel in their customer record. */
export function channelFor(business: Business): ContactChannel {
  return business.whatsapp.on ? 'WHATSAPP' : business.contact.channel;
}

/** Whether the owner may be messaged now: they haven't opted out, and it's within their contact window. */
export function canContactNow(business: Business, now = new Date()) {
  if (business.contact.optedOut) return false;
  return inContactWindow(business.contact.window, business.contact.timeZone, now);
}

type OutgoingMessage = {
  body: string;
  buttons?: ReturnType<typeof suggestionButtons>;
  startsConversation?: boolean;
};

/** Sends one message on the owner's channel. Channels this app can't send on yet go to the outbox. */
async function deliver(business: Business, message: OutgoingMessage) {
  const channel = channelFor(business);
  if (channel === 'WHATSAPP') {
    if (!whatsappEnabled()) return err({ reason: 'NotConfigured' as const });
    if (!business.whatsapp.phone) return err({ reason: 'NoPhone' as const });
    const result = await sendWhatsApp({
      to: business.whatsapp.phone,
      body: message.body,
      language: business.whatsapp.language,
      buttons: message.buttons,
      startsConversation: message.startsConversation,
    });
    if (result.error) return err({ reason: 'SendFailed' as const, message: result.error });
    return ok({ channel });
  }

  await db.insert(outbox).values({
    id: crypto.randomUUID(),
    entityId: business.id,
    channel,
    recipient: recipientFor(business, channel),
    // WhatsApp shows *text* in bold; elsewhere the asterisks would show as they are.
    body: message.body.replaceAll('*', ''),
  });
  return ok({ channel });
}

function recipientFor(business: Business, channel: ContactChannel) {
  if (channel === 'EMAIL') return business.contact.email;
  if (channel === 'SMS') return business.contact.mobile;
  return 'Connect app';
}

/** Sends the most important waiting suggestion, unless the owner still has one to answer. */
export async function sendNext(business: Business, origin: string) {
  if (!canContactNow(business)) return ok({ sent: false });

  const { pending } = await listSuggestions(business);
  if (pending.some((item) => item.sentAt)) return ok({ sent: false });
  const next = sendable(pending, business.whatsapp.minImportance);
  if (!next) return ok({ sent: false });

  const message = await buildMessage(business, next, origin);
  const [error] = await deliver(business, {
    body: message.body,
    buttons: message.buttons,
    startsConversation: !inWindow(business),
  });
  if (error) return err(error);
  await db
    .update(suggestionState)
    .set({ sentAt: new Date() })
    .where(and(eq(suggestionState.entityId, business.id), eq(suggestionState.suggestionKey, next.key)));
  return ok({ sent: true });
}

/** "Handle public holidays without asking": apply the ones nothing speaks against, then tell the owner. */
export async function applyStandingPermission(business: Business) {
  if (!business.whatsapp.standingPermission) return ok({ applied: 0 });
  const { pending } = await listSuggestions(business);
  const eligible = pending.filter(
    (item) =>
      item.kind === 'hours' &&
      item.publicHoliday &&
      (item.confidence ?? 0) >= STANDING_MIN_CONFIDENCE &&
      !disagrees(item),
  );
  const language = business.whatsapp.language;
  const applied: string[] = [];
  for (const item of eligible) {
    const [error] = await decide(business.id, item.key, { action: 'approve' }, 'standing');
    if (error) {
      log.warn('standing', 'not applied', { reason: error.reason, date: item.key });
      continue;
    }
    applied.push(`${localDay(item.date!, language)} ${localHours(item.suggested!, language)}`);
  }
  if (applied.length && !business.contact.optedOut) {
    const [error] = await deliver(business, {
      body: t(language).standing(business.name, applied.join(', ')),
    });
    if (error) log.warn('standing', 'owner not told', { reason: error.reason, entity: business.id });
  }
  return ok({ applied: applied.length });
}

/** Runs when an account takes on a business, so a standing permission from before takes effect straight away. */
export async function onBusinessLinked(entityId: string) {
  await ensureProfile(entityId);
  const business = await getBusiness(entityId);
  if (business) await applyStandingPermission(business);
}

export async function saveWhatsApp(entityId: string, input: WhatsAppPayload, origin: string) {
  await ensureProfile(entityId);
  // Stored without spaces so a webhook's sender can be matched to it.
  const phone = input.phone.replace(/\s+/g, '');
  await db
    .update(businessProfile)
    .set({
      whatsappPhone: phone || null,
      whatsappLanguage: input.language,
      whatsappOn: input.on,
      whatsappMinImportance: input.minImportance,
      standingPermission: input.standingPermission,
    })
    .where(eq(businessProfile.entityId, entityId));

  const business = await getBusiness(entityId);
  if (!business) return err({ reason: 'NotFound' as const });
  const [, standing] = await applyStandingPermission(business);
  const applied = standing?.applied ?? 0;
  if (!input.on) return ok({ sent: false, applied, error: undefined as string | undefined });

  const [error, result] = await sendNext(business, origin);
  if (error?.reason === 'SendFailed')
    return ok({ sent: false, applied, error: error.message as string | undefined });
  return ok({ sent: !!result?.sent, applied, error: undefined as string | undefined });
}

/** The owner's opt-out. Turning messages back on sends the next suggestion if it's within their window. */
export async function saveContact(entityId: string, input: ContactPayload, origin: string) {
  await ensureProfile(entityId);
  await db
    .update(businessProfile)
    .set({ optedOut: input.optedOut })
    .where(eq(businessProfile.entityId, entityId));
  const business = await getBusiness(entityId);
  if (!business) return err({ reason: 'NotFound' as const });
  if (input.optedOut) return ok({ sent: false });
  return sendNext(business, origin);
}

export async function sendTest(business: Business) {
  if (!business.whatsapp.phone) return err({ reason: 'NoPhone' as const });
  if (!whatsappEnabled()) return err({ reason: 'NotConfigured' as const });
  const result = await sendTestTemplate(business.whatsapp.phone);
  if (result.error) return err({ reason: 'SendFailed' as const, message: result.error });
  return ok({ sent: true });
}

/** A message or button tap from an owner. */
export async function receiveWhatsApp(from: string, buttonId: string | undefined, origin: string) {
  const phone = `+${from.replace(/\D/g, '')}`;
  const [profile] = await db.select().from(businessProfile).where(eq(businessProfile.whatsappPhone, phone));
  if (!profile) {
    log.info('whatsapp', 'message from unknown number', { from: maskPhone(from) });
    return;
  }
  await db
    .update(businessProfile)
    .set({ lastInboundAt: new Date() })
    .where(eq(businessProfile.entityId, profile.entityId));
  const business = await getBusiness(profile.entityId);
  if (!business) return;

  const language = business.whatsapp.language;
  const c = t(language);
  const reply = (body: string) => sendWhatsApp({ to: phone, body, language });

  const [action, token] = (buttonId ?? '').split(':');
  if (!token) return void (await reply(c.useButtons));
  const [state] = await db
    .select()
    .from(suggestionState)
    .where(and(eq(suggestionState.token, token), eq(suggestionState.entityId, business.id)));
  if (!state) return void (await reply(c.useButtons));
  if (action === 'edit') return void (await reply(c.edit(suggestionUrl(origin, token))));

  const [error, result] = await decide(
    business.id,
    state.suggestionKey,
    { action: action === 'approve' ? 'approve' : 'decline' },
    'whatsapp',
  );
  if (error) return void (await reply(error.reason === 'AlreadyAnswered' ? c.answered : c.useButtons));

  const { decision, item } = result;
  await reply(
    decision.status === 'declined'
      ? c.declined
      : confirmationMessage(decision.hours!, item.date!, decision.sites, language),
  );
  await sendNext(business, origin);
}

/**
 * Every hour: once a day, look at linked pages again. Owners whose contact window is open get their standing
 * permissions applied and their next question.
 */
export async function runScheduled(origin: string, now = new Date()) {
  const checkPages = now.getUTCHours() === PAGE_CHECK_HOUR_UTC;
  const profiles = await db
    .select({ entityId: businessProfile.entityId })
    .from(businessProfile)
    .innerJoin(user, eq(user.entityId, businessProfile.entityId));
  for (const entityId of new Set(profiles.map((p) => p.entityId))) {
    try {
      let business = await getBusiness(entityId);
      if (!business) continue;
      if (checkPages) {
        await recheckSources(business);
        business = (await getBusiness(entityId))!;
      }
      if (!canContactNow(business, now)) continue;
      await applyStandingPermission(business);
      await sendNext(business, origin);
    } catch (error) {
      log.error('scheduled', 'business failed', { entity: entityId, error });
    }
  }
}
