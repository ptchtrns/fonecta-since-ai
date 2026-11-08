import 'server-only';
import { z } from 'zod';
import { formatDay, formatHours, groupWeek, weekToText } from '~/lib/hours';
import { suggestionStats } from '~/lib/report';
import { err, ok } from '~/lib/result';
import { assistantSources, HOLIDAY_WINDOW_DAYS, type Check } from '~/lib/visibility';
import type { AskPayload } from '~/schemas/assistant.schema';
import { aiEnabled, modelLabel, structured, write, type Turn } from '~/server/ai';
import { getBusiness, type Business } from '~/services/business.service';
import { getPresence } from '~/services/presence.service';
import { listSuggestions, upcomingExceptions } from '~/services/suggestions.service';
import { getTraffic } from '~/services/traffic.service';

// Two uses of a language model, both answering only from the business's own data:
// - As a customer's assistant (Visibility → AI): what ChatGPT, Gemini or Siri can say when all they have is the
//   listing Connect publishes. It's a stand-in for those assistants, which also read other sites.
// - As the owner's advisor (the front page's box): how to get found, with this business's scores and gaps.

type Presence = Awaited<ReturnType<typeof getPresence>>;

/** The questions on the AI tab, the same ones the rule-based answers cover. */
export const CUSTOMER_QUESTIONS = (name: string) => [
  `Is ${name} open right now?`,
  `Is ${name} open on Christmas Day?`,
  `What kind of place is ${name}?`,
  `How do I contact ${name}?`,
  `Is ${name} any good?`,
];

/** Weekday, date and time where the business is: "Sunday 8 November 2026, 14:05". */
function localTime(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}

/** The listing as the sites Connect publishes to have it. This is all an assistant gets from Connect. */
async function listingText(business: Business, presence: Presence) {
  const exceptions = await upcomingExceptions(business);
  const week = groupWeek(weekToText(business.hours))
    .map((g) => `${g.days} ${formatHours(g.hours)}`)
    .join('; ');
  return [
    `Name: ${business.name}`,
    `Category: ${business.category}`,
    `Address: ${[business.addressLine1, `${business.postalCode} ${business.city}`].filter((x) => x.trim()).join(', ')}`,
    `Phone: ${business.phone || '(none listed)'}`,
    `Website: ${business.website || '(none listed)'}`,
    `Description: ${business.description || '(none)'}`,
    `Opening hours: ${week}`,
    `Special hours: ${exceptions.map((e) => `${formatDay(e.date)} ${e.date.slice(0, 4)}${e.label ? ` (${e.label})` : ''}: ${formatHours(e.hours)}`).join('; ') || '(none listed)'}`,
    // Map sites hand assistants a worked-out status, the same line Google shows.
    `Open now: ${presence.openingNow}`,
    `Reviews: ${presence.reviews.count ? `${presence.reviews.count}, average ${presence.reviews.averageRating.toFixed(1)} of 5` : '(none)'}`,
    ...presence.reviews.recent.map((r) => `Review (${r.rating}/5, ${r.date}): ${r.content.slice(0, 300)}`),
  ].join('\n');
}

const customerSystem = (business: Business, listing: string) =>
  `You are an AI assistant such as ChatGPT, Gemini or Siri. A customer asks about a local business. All you know about it is its listing below, which reached you through Google, Bing and Apple Maps. Answer like such an assistant would: short, friendly, one to three sentences, in the language of the question. Use only the listing. If the listing doesn't say, say you don't know or are not sure, and never invent hours, prices, menus or contact details. For "open now" questions use the listing's "Open now" line, which the map site works out from the hours, special hours included.
Current local time at the business: ${localTime(business.timezone)}.

Listing:
${listing}`;

const answersSchema = z.object({
  answers: z.array(
    z.object({
      answer: z.string().min(1),
      // Whether the listing had what the answer needed, rather than "I don't know" or a guess.
      known: z.boolean(),
    }),
  ),
});

// The answers depend on the listing and the hour, so they're kept briefly per business.
const CACHE_MS = 15 * 60_000;
const answerCache = new Map<string, { at: number; value: CustomerAnswers }>();
export type CustomerAnswers = {
  answers: { question: string; answer: string; known: boolean }[];
  model: string;
};

/** A model's answers to the AI tab's questions, from the listing alone. Null without a model. */
export async function customerAnswers(entityId: string) {
  if (!aiEnabled()) return err({ reason: 'NoModel' as const });
  const business = await getBusiness(entityId);
  if (!business) return err({ reason: 'NotFound' as const });
  const presence = await getPresence(business);
  const listing = await listingText(business, presence);
  const key = `${entityId}\n${new Date().toISOString().slice(0, 13)}\n${listing}`;
  const hit = answerCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return ok(hit.value);

  const questions = CUSTOMER_QUESTIONS(business.name);
  const found = await structured(
    answersSchema,
    customerSystem(business, listing),
    `Answer each of these customer questions, in order, in English. For each, set "known" to true only when the listing had what the answer needed.\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
    'write',
  );
  if (!found || found.result.answers.length !== questions.length)
    return err({ reason: 'ModelFailed' as const });
  const value: CustomerAnswers = {
    answers: questions.map((question, i) => ({ question, ...found.result.answers[i]! })),
    model: modelLabel(found.model),
  };
  answerCache.set(key, { at: Date.now(), value });
  return ok(value);
}

const missingLines = (checks: Check[], where: string) =>
  checks.filter((c) => !c.done).map((c) => `- ${c.label} (${c.points} points, ${where}): ${c.detail}`);

const fixPlace = (check: Check) =>
  check.fix === 'company'
    ? 'Company information'
    : check.fix === 'suggestions'
      ? 'Front page suggestions'
      : '';

/** What the advisor knows: the listing plus the scores, gaps, suggestions and traffic the dashboard shows. */
async function ownerFacts(business: Business, presence: Presence) {
  const [listing, suggestions, traffic] = await Promise.all([
    listingText(business, presence),
    listSuggestions(business),
    getTraffic(business),
  ]);
  const stats = suggestionStats(suggestions.pending.length, suggestions.handled);
  const live = presence.listings.filter((l) => l.live);
  const gaps = [
    ...missingLines(presence.profile.checks, 'profile'),
    ...missingLines(presence.search.checks, 'local search'),
    ...missingLines(presence.ai.checks, 'AI visibility'),
  ];
  const fixes = [...presence.profile.checks, ...presence.search.checks, ...presence.ai.checks]
    .filter((c) => !c.done && fixPlace(c))
    .map((c) => `${c.label} → ${fixPlace(c)}`);
  return `${listing}

Live on ${live.length} of ${presence.listings.length} listing sites: ${live.map((l) => l.name).join(', ') || 'none'}
Not live: ${
    presence.listings
      .filter((l) => !l.live)
      .map((l) => `${l.name} (${l.status.toLowerCase()})`)
      .join(', ') || 'none'
  }
AI assistants' sources: ${assistantSources(presence.listings)
    .map((a) => `${a.site} for ${a.assistants}: ${a.status}`)
    .join('; ')}
Scores out of 100: profile ${presence.profile.score}, local search ${presence.search.score}, AI visibility ${presence.ai.score}
Not done yet:
${[...new Set(gaps)].join('\n') || '- nothing'}
Where each is fixed: ${[...new Set(fixes)].join('; ') || '-'}
Public holidays in the next ${HOLIDAY_WINDOW_DAYS} days without hours: ${presence.missingHolidays.map((h) => `${h.label} ${h.date}`).join(', ') || 'none'}
Suggested edits from Google users waiting for an answer: ${presence.googleEdits.map((e) => `${e.change} (${e.site})`).join('; ') || 'none'}
Connecta AI's suggestions waiting: ${
    suggestions.pending
      .slice(0, 5)
      .map((p) =>
        p.kind === 'closure'
          ? 'Have you closed for good? (customers say so)'
          : `${p.label} ${p.date}: suggest ${formatHours(p.suggested ?? '')}, Google shows ${formatHours(p.shown)}; ${p.reasons[0] ?? ''}`,
      )
      .join(' | ') || 'none'
  }
Answered so far: ${stats.answered} (${stats.published} published to the sites, ${stats.declined} declined, ${stats.automatic} applied automatically)
Google statistics: ${
    traffic
      ? `last ${traffic.days} days to ${traffic.to}: ${traffic.totals.views} views (${traffic.change.views === null ? 'no earlier period' : `${Math.round(traffic.change.views * 100)}% vs the ${traffic.days} days before`}), ${traffic.totals.searches} searches, ${traffic.totals.actions} actions such as directions or website clicks, ${traffic.totals.calls} calls`
      : 'not available'
  }`;
}

const ownerSystem = (facts: string) =>
  `You are Connecta AI, the assistant in Fonecta Connect for local business owners. You talk to the OWNER of the business below. Connect keeps their listing right on Google, Apple Maps, Bing, Facebook and other sites, and so in AI assistants, which answer from listing data.
Help the owner get found and chosen by local customers, using only the facts below. Never give generic marketing advice that ignores them, and never make up numbers.
- For "how do I improve" questions, give the two or three changes worth the most, each on one "1." line: why it matters and exactly where in Connecta AI it's done: Front page (suggestions to answer), Company information (hours, phone, website, description, linked pages), Visibility (Listings, SEO and AI tabs), Reports (statistics), Integrations (WhatsApp, Telegram, email, standing permission for public holidays).
- If they ask what a customer would ask (are you open, how to reach you), say what an assistant would answer from the listing today, then what to add if something's missing.
- Mention a waiting suggestion when it already solves the problem.
- Follow-ups ("the second one", "how?") refer to your previous answer.
- Answer in the language of the owner's latest message, in plain text, at most 120 words. Today is ${new Date().toISOString().slice(0, 10)}.

Facts:
${facts}`;

const MAX_TURNS = 8;

/** One answer in the front page's conversation or the AI tab's "ask like a customer" box. */
export async function ask(entityId: string, input: AskPayload) {
  if (!aiEnabled()) return err({ reason: 'NoModel' as const });
  const business = await getBusiness(entityId);
  if (!business) return err({ reason: 'NotFound' as const });
  const presence = await getPresence(business);
  const system =
    input.mode === 'customer'
      ? customerSystem(business, await listingText(business, presence))
      : ownerSystem(await ownerFacts(business, presence));
  const turns: Turn[] = [
    ...input.history.slice(-MAX_TURNS).map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: input.question },
  ];
  const answer = await write(system, turns, input.mode === 'customer' ? 300 : 500);
  if (!answer) return err({ reason: 'ModelFailed' as const });
  return ok({ answer: answer.text, model: modelLabel(answer.model) });
}
