import 'server-only';
import { and, eq } from 'drizzle-orm';
import {
  businessProfile,
  customerContact,
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
  suggestionSubject,
  t,
} from '~/lib/messages';
import { inContactWindow } from '~/lib/contact-window';
import { meetsImportance, type Importance } from '~/lib/importance';
import { err, ok } from '~/lib/result';
import { toEmailHtml, toPlain } from '~/lib/rich-text';
import type {
  ContactPayload,
  EmailPayload,
  MessageSettingsPayload,
  WhatsAppPayload,
} from '~/schemas/business.schema';
import { db } from '~/server/db';
import { log, maskPhone } from '~/server/log';
import { emailEnabled, sendEmail } from '~/server/email';
import {
  answerCallback,
  clearButtons,
  sendTelegram,
  startLink,
  telegramEnabled,
  type Update as TelegramUpdate,
} from '~/server/telegram';
import { sendTestTemplate, sendWhatsApp, whatsappEnabled } from '~/server/whatsapp';
import { ensureProfile, getBusiness, type Business } from '~/services/business.service';
import { recheckSources } from '~/services/sources.service';
import { decide, ensureState, listSuggestions, type SuggestionItem } from '~/services/suggestions.service';

// Reaching the owner: one suggestion at a time, the most important first, and the next one only after they've
// answered, so nobody gets a pile of messages. Standing permission skips the question for public holidays.
// Every message respects the owner's preferences in their customer record: nothing after an opt-out, only within their
// contact window, and on their preferred channel plus any other channel they turned on here. WhatsApp, Telegram and
// email (through Resend) are sent for real once connected; text messages, app notifications, a preferred channel that
// isn't connected yet, and email to the customer record's address go to the outbox.

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
    subject: suggestionSubject({ dayName: item.dayNames[language], suggested: item.suggested!, language }),
    buttons: suggestionButtons(item.suggested!, token, language),
  };
}

/** The message as the owner gets it, in their language. */
export async function buildMessage(business: Business, item: SuggestionItem, origin: string) {
  const state = await ensureState(business.id, item);
  const url = suggestionUrl(origin, state.token);
  return { state, url, ...compose(business, item, url, state.token, business.contact.language) };
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

/** The channels this app sends on for real that the owner set up and turned on here. */
export function connectedChannels(business: Business): ContactChannel[] {
  const connected: ContactChannel[] = [];
  if (business.whatsapp.on && business.whatsapp.phone) connected.push('WHATSAPP');
  if (business.telegram.chatId) connected.push('TELEGRAM');
  if (business.email.on && business.email.address) connected.push('EMAIL');
  return connected;
}

/** The owner's preferred channel first, then every other channel they turned on here. */
export function channelsFor(business: Business): ContactChannel[] {
  return [...new Set([business.contact.channel, ...connectedChannels(business)])];
}

/** Whether the owner may be messaged now: they haven't opted out, and it's within their contact window. */
export function canContactNow(business: Business, now = new Date()) {
  if (business.contact.optedOut) return false;
  return inContactWindow(business.contact.window, business.contact.timeZone, now);
}

type OutgoingMessage = {
  body: string;
  /** Email only. */
  subject: string;
  buttons?: ReturnType<typeof suggestionButtons>;
  /** The answer page. Email links to it; Telegram's edit button opens it. */
  url?: string;
  startsConversation?: boolean;
};

type DeliveryError = {
  reason: 'NotConfigured' | 'NotConnected' | 'SendFailed';
  channel: ContactChannel;
  message?: string;
};

async function deliverOn(business: Business, channel: ContactChannel, message: OutgoingMessage) {
  const fail = (reason: DeliveryError['reason'], text?: string) =>
    err<DeliveryError>({ reason, channel, message: text });
  const language = business.contact.language;
  const connected = connectedChannels(business).includes(channel);

  if (channel === 'WHATSAPP' && connected) {
    if (!whatsappEnabled()) return fail('NotConfigured');
    const result = await sendWhatsApp({
      to: business.whatsapp.phone,
      body: message.body,
      language,
      buttons: message.buttons,
      startsConversation: message.startsConversation,
    });
    return result.error ? fail('SendFailed', result.error) : ok({ channel });
  }

  if (channel === 'TELEGRAM' && connected) {
    if (!telegramEnabled()) return fail('NotConfigured');
    const buttons = (message.buttons ?? []).map((b) => ({
      ...b,
      url: b.id.startsWith('edit:') ? message.url : undefined,
    }));
    const result = await sendTelegram(business.telegram.chatId!, message.body, buttons);
    return result.error ? fail('SendFailed', result.error) : ok({ channel });
  }

  // Real email only to an address the owner gave here; the customer record's address goes to the outbox.
  if (channel === 'EMAIL' && connected) {
    if (!emailEnabled()) return fail('NotConfigured');
    const result = await sendEmail({
      to: business.email.address,
      subject: message.subject,
      text: toPlain(message.body),
      html: toEmailHtml(
        message.body,
        message.url ? { label: t(language).answer, url: message.url } : undefined,
      ),
    });
    return result.error ? fail('SendFailed', result.error) : ok({ channel });
  }

  await db.insert(outbox).values({
    id: crypto.randomUUID(),
    entityId: business.id,
    channel,
    recipient: recipientFor(business, channel),
    // WhatsApp shows *text* in bold; elsewhere the asterisks would show as they are.
    body: toPlain(message.body),
  });
  return ok({ channel });
}

/**
 * Sends one message on each of the owner's channels. Channels this app can't send on yet go to the outbox. It counts
 * as sent when any channel took it; the others' failures are logged.
 */
async function deliver(business: Business, message: OutgoingMessage, channels = channelsFor(business)) {
  const results = await Promise.all(channels.map((channel) => deliverOn(business, channel, message)));
  const failures = results.flatMap(([error]) => (error ? [error] : []));
  for (const f of failures) log.warn('contact', 'not delivered', { channel: f.channel, reason: f.reason });
  if (failures.length === results.length) return err(failures[0]!);
  return ok({ channels: results.flatMap(([, sent]) => (sent ? [sent.channel] : [])), failures });
}

function recipientFor(business: Business, channel: ContactChannel) {
  if (channel === 'EMAIL') return business.contact.email;
  if (channel === 'SMS' || channel === 'WHATSAPP') return business.contact.mobile;
  if (channel === 'TELEGRAM') return 'Telegram';
  return 'Connect app';
}

/**
 * Sends the most important waiting suggestion, unless the owner still has one to answer. `added` are channels
 * the owner just turned on: they get the unanswered one, so a new channel doesn't stay quiet until it's answered.
 */
export async function sendNext(business: Business, origin: string, added: ContactChannel[] = []) {
  if (!canContactNow(business)) return ok({ sent: false, failures: [] as DeliveryError[] });

  const { pending } = await listSuggestions(business);
  const waiting = pending.find((item) => item.sentAt);
  // While one is unanswered, only channels just turned on get anything: that one.
  if (waiting && !added.length) return ok({ sent: false, failures: [] as DeliveryError[] });
  const next = waiting ?? sendable(pending, business.whatsapp.minImportance);
  if (!next) return ok({ sent: false, failures: [] as DeliveryError[] });

  const message = await buildMessage(business, next, origin);
  const [error, result] = await deliver(
    business,
    {
      body: message.body,
      subject: message.subject,
      buttons: message.buttons,
      url: message.url,
      startsConversation: !inWindow(business),
    },
    waiting ? added : undefined,
  );
  if (error) return err(error);
  if (!waiting) {
    await db
      .update(suggestionState)
      .set({ sentAt: new Date() })
      .where(and(eq(suggestionState.entityId, business.id), eq(suggestionState.suggestionKey, next.key)));
  }
  return ok({ sent: true, failures: result.failures });
}

/** "Handle public holidays without asking": apply the ones nothing speaks against, then tell the owner. */
export async function applyStandingPermission(business: Business) {
  if (!business.contact.standingPermission) return ok({ applied: 0 });
  const { pending } = await listSuggestions(business);
  const eligible = pending.filter(
    (item) =>
      item.kind === 'hours' &&
      item.publicHoliday &&
      (item.confidence ?? 0) >= STANDING_MIN_CONFIDENCE &&
      !disagrees(item),
  );
  const language = business.contact.language;
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
      subject: t(language).standingSubject(business.name),
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

/** Whether the owner turned on a channel here, so answering elsewhere should move that conversation along. */
export const usesOwnChannel = (business: Business) =>
  business.whatsapp.on || !!business.telegram.chatId || (business.email.on && !!business.email.address);

/**
 * After a channel is turned on or pointed somewhere new: send the next suggestion, or the unanswered one to that
 * channel. Returns what happened on that channel, for the save message.
 */
async function startChannel(business: Business, origin: string, channel: ContactChannel, isNew: boolean) {
  const [error, result] = await sendNext(business, origin, isNew ? [channel] : []);
  const failure = (error ? [error] : result.failures).find((f) => f.channel === channel);
  return { sent: !error && result.sent && !failure, failure };
}

export async function saveWhatsApp(entityId: string, input: WhatsAppPayload, origin: string) {
  await ensureProfile(entityId);
  const before = await getBusiness(entityId);
  // Stored without spaces so a webhook's sender can be matched to it.
  const phone = input.phone.replace(/\s+/g, '');
  await db
    .update(businessProfile)
    .set({ whatsappPhone: phone || null, whatsappOn: input.on })
    .where(eq(businessProfile.entityId, entityId));

  const business = await getBusiness(entityId);
  if (!business) return err({ reason: 'NotFound' as const });
  if (!input.on) return ok({ sent: false, failure: undefined });
  const isNew = !before?.whatsapp.on || before.whatsapp.phone !== phone;
  return ok(await startChannel(business, origin, 'WHATSAPP', isNew));
}

export async function saveEmail(entityId: string, input: EmailPayload, origin: string) {
  await ensureProfile(entityId);
  const before = await getBusiness(entityId);
  await db
    .update(businessProfile)
    .set({ emailAddress: input.address || null, emailOn: input.on })
    .where(eq(businessProfile.entityId, entityId));

  const business = await getBusiness(entityId);
  if (!business) return err({ reason: 'NotFound' as const });
  if (!input.on) return ok({ sent: false, failure: undefined });
  const isNew = !before?.email.on || before.email.address !== input.address;
  return ok(await startChannel(business, origin, 'EMAIL', isNew));
}

/** Language, which suggestions go out, and standing permission: the same on every channel. */
export async function saveMessageSettings(entityId: string, input: MessageSettingsPayload, origin: string) {
  await ensureProfile(entityId);
  await db
    .update(businessProfile)
    .set({ whatsappMinImportance: input.minImportance })
    .where(eq(businessProfile.entityId, entityId));
  await db
    .update(customerContact)
    .set({ preferredLanguage: input.language, standingPermissionHolidays: input.standingPermission })
    .where(eq(customerContact.entityId, entityId));

  const business = await getBusiness(entityId);
  if (!business) return err({ reason: 'NotFound' as const });
  const [, standing] = await applyStandingPermission(business);
  // A lower level can make a suggestion sendable that wasn't before.
  const [, next] = await sendNext(business, origin);
  return ok({ applied: standing?.applied ?? 0, sent: !!next?.sent });
}

/**
 * The owner's opt-out and preferred channel, in their customer record. Turning messages back on sends the next
 * suggestion if it's within their window; a new preferred channel also gets the one still unanswered.
 */
export async function saveContact(entityId: string, input: ContactPayload, origin: string) {
  await ensureProfile(entityId);
  const before = await getBusiness(entityId);
  await db
    .update(customerContact)
    .set({ optedOutOfSuggestions: input.optedOut, preferredChannel: input.preferredChannel })
    .where(eq(customerContact.entityId, entityId));
  const business = await getBusiness(entityId);
  if (!business) return err({ reason: 'NotFound' as const });
  if (business.contact.optedOut) return ok({ sent: false, failures: [] as DeliveryError[] });
  const channel = business.contact.channel;
  const isNew = !!before && before.contact.channel !== channel && !channelsFor(before).includes(channel);
  return sendNext(business, origin, isNew ? [channel] : []);
}

/** A test on one channel, to the owner's saved address. It ignores contact hours: the owner asked for it. */
export async function sendTest(business: Business, channel: 'WHATSAPP' | 'EMAIL' | 'TELEGRAM') {
  const text = t(business.contact.language).test(business.name);
  const sent = (result: { error?: string }) =>
    result.error ? err({ reason: 'SendFailed' as const, message: result.error }) : ok({ sent: true });

  if (channel === 'WHATSAPP') {
    if (!business.whatsapp.phone) return err({ reason: 'NoAddress' as const });
    if (!whatsappEnabled()) return err({ reason: 'NotConfigured' as const });
    return sent(await sendTestTemplate(business.whatsapp.phone));
  }
  if (channel === 'EMAIL') {
    if (!business.email.address) return err({ reason: 'NoAddress' as const });
    if (!emailEnabled()) return err({ reason: 'NotConfigured' as const });
    return sent(
      await sendEmail({ to: business.email.address, subject: text, text, html: toEmailHtml(text) }),
    );
  }
  if (!business.telegram.chatId) return err({ reason: 'NoAddress' as const });
  if (!telegramEnabled()) return err({ reason: 'NotConfigured' as const });
  return sent(await sendTelegram(business.telegram.chatId, text));
}

/**
 * A button tap, on WhatsApp or Telegram: `action:token`. Edit sends the answer page; approve and dismiss decide,
 * confirm, and send the next suggestion. Returns whether the suggestion is now answered.
 */
async function answerTap(
  business: Business,
  buttonId: string | undefined,
  origin: string,
  via: 'whatsapp' | 'telegram',
  reply: (body: string) => Promise<unknown>,
) {
  const language = business.contact.language;
  const c = t(language);
  const [action, token] = (buttonId ?? '').split(':');
  if (!token) {
    await reply(c.useButtons);
    return false;
  }
  const [state] = await db
    .select()
    .from(suggestionState)
    .where(and(eq(suggestionState.token, token), eq(suggestionState.entityId, business.id)));
  if (!state || action === 'edit') {
    await reply(state ? c.edit(suggestionUrl(origin, token)) : c.useButtons);
    return false;
  }

  const [error, result] = await decide(
    business.id,
    state.suggestionKey,
    { action: action === 'approve' ? 'approve' : 'decline' },
    via,
  );
  if (error) {
    await reply(error.reason === 'AlreadyAnswered' ? c.answered : c.useButtons);
    return error.reason === 'AlreadyAnswered';
  }

  const { decision, item } = result;
  await reply(
    decision.status === 'declined'
      ? c.declined
      : confirmationMessage(decision.hours!, item.date!, decision.sites, language),
  );
  await sendNext(business, origin);
  return true;
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
  const language = business.contact.language;
  await answerTap(business, buttonId, origin, 'whatsapp', (body) =>
    sendWhatsApp({ to: phone, body, language }),
  );
}

/** The "Connect Telegram" link: opens the bot, which then knows which business the chat is for. */
export async function telegramConnectLink(entityId: string) {
  const [profile] = await db
    .select({ token: businessProfile.telegramLinkToken })
    .from(businessProfile)
    .where(eq(businessProfile.entityId, entityId));
  if (!profile) return null;
  let token = profile.token;
  if (!token) {
    token = crypto.randomUUID().replaceAll('-', '');
    await db
      .update(businessProfile)
      .set({ telegramLinkToken: token })
      .where(eq(businessProfile.entityId, entityId));
  }
  return startLink(token);
}

export async function disconnectTelegram(entityId: string) {
  await db
    .update(businessProfile)
    .set({ telegramChatId: null, telegramName: null, telegramLinkToken: null })
    .where(eq(businessProfile.entityId, entityId));
}

/** An update from the Telegram bot: the owner connecting, writing, or tapping a button. */
export async function receiveTelegram(update: TelegramUpdate, origin: string) {
  const reply = (body: string) => sendTelegram(update.chatId, body);

  if (update.kind === 'start') {
    const [profile] = await db
      .select({ entityId: businessProfile.entityId })
      .from(businessProfile)
      .where(eq(businessProfile.telegramLinkToken, update.token));
    if (!profile) return void (await reply(t('en').linkExpired));
    // The token is used up: the link on the page is replaced next time it's shown.
    await db
      .update(businessProfile)
      .set({ telegramChatId: update.chatId, telegramName: update.name, telegramLinkToken: null })
      .where(eq(businessProfile.entityId, profile.entityId));
    const business = await getBusiness(profile.entityId);
    if (!business) return;
    log.info('telegram', 'connected', { entity: business.id });
    await reply(t(business.contact.language).connected(business.name));
    await sendNext(business, origin, ['TELEGRAM']);
    return;
  }

  if (update.kind === 'text') {
    const [profile] = await db
      .select({ language: customerContact.preferredLanguage })
      .from(businessProfile)
      .innerJoin(customerContact, eq(customerContact.entityId, businessProfile.entityId))
      .where(eq(businessProfile.telegramChatId, update.chatId));
    return void (await reply(profile ? t(profile.language).useButtons : t('en').linkExpired));
  }

  await answerCallback(update.callbackId);
  // The token says which business; the chat has to be the one connected to it.
  const token = update.data.split(':')[1] ?? '';
  const [state] = token
    ? await db
        .select({ entityId: suggestionState.entityId })
        .from(suggestionState)
        .where(eq(suggestionState.token, token))
    : [];
  const business = state ? await getBusiness(state.entityId) : null;
  if (!business || business.telegram.chatId !== update.chatId) {
    log.info('telegram', 'tap from a chat not connected to this business');
    return;
  }
  const answered = await answerTap(business, update.data, origin, 'telegram', reply);
  if (answered && update.messageId) await clearButtons(update.chatId, update.messageId);
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
