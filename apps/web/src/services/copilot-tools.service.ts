import 'server-only';
import { z } from 'zod';
import { contactChannels, importances, languages, type CopilotDiffRow } from '~/db/schema';
import { findGuide, guides } from '~/guides';
import { TOOL_RESULT_BUDGET, fitToBudget } from '~/lib/copilot/budget';
import { diffFields, type FieldValues } from '~/lib/copilot/diff';
import { guideText, searchGuides } from '~/lib/copilot/guides';
import { cleanText } from '~/lib/copilot/sanitize';
import type { Capability } from '~/lib/copilot/types';
import { formatDay, formatHours, HOURS_TEXT, WEEKDAYS, weekToText, type Weekday } from '~/lib/hours';
import { publishedSummary } from '~/lib/messages';
import { err, ok, type Result } from '~/lib/result';
import {
  businessEditSchema,
  contactSchema,
  decideSchema,
  messageSettingsSchema,
} from '~/schemas/business.schema';
import { getBusiness, saveBusiness } from '~/services/business.service';
import { saveContact, saveMessageSettings, sendNext, usesOwnChannel } from '~/services/contact.service';
import { selectedRecord, showHours, type Snapshot } from '~/services/copilot-context.service';
import type { Owner } from '~/services/copilot-store.service';
import { answerEdit } from '~/services/edits.service';
import { decide, FLAG_KEY } from '~/services/suggestions.service';

// The copilot's allowlist. The model can name only these; anything else is refused and recorded. Each tool states
// the capability it needs and validates its arguments with its own schema, strictly (unknown fields are refused).
//
// - read tools answer from the turn's snapshot or the guides. They change nothing.
// - propose tools change nothing either: they return a preview (what would change, field by field, and what else
//   happens). Only the owner's confirmation commits it, through `commit`, which calls the same domain service the
//   dashboard's own forms use. Those services stay the source of truth, and the only path to D1 and Yext.

export type ToolContext = { owner: Owner; capabilities: Capability[]; origin: string; snapshot: Snapshot };
export type ToolError = { reason: string; message: string };
const fail = (reason: string, message: string) => err<ToolError>({ reason, message });

export type ReadResult = { summary: string; data: unknown };

export type Proposal = {
  payload: Record<string, unknown>;
  diff: CopilotDiffRow[];
  effects: string[];
  summary: string;
};

type Base<S extends z.ZodType> = {
  name: string;
  description: string;
  /** The arguments as the model is told them. The schema is what's enforced. */
  args: string;
  capability: Capability;
  schema: S;
};

export type ReadTool<S extends z.ZodType = z.ZodType> = Base<S> & {
  kind: 'read';
  run: (
    ctx: ToolContext,
    args: z.infer<S>,
  ) => Result<ReadResult, ToolError> | Promise<Result<ReadResult, ToolError>>;
};

export type ProposeTool<S extends z.ZodType = z.ZodType<Record<string, unknown>>> = Base<S> & {
  kind: 'propose';
  prepare: (
    ctx: ToolContext,
    args: z.infer<S>,
  ) => Promise<Result<Proposal, ToolError>> | Result<Proposal, ToolError>;
  /** The current values the change starts from. Hashed with the preview and compared again on commit. */
  base: (snapshot: Snapshot, payload: z.infer<S>) => FieldValues;
  commit: (ctx: ToolContext, payload: z.infer<S>) => Promise<Result<{ message: string }, ToolError>>;
};

export type Tool = ReadTool | ProposeTool;

const readTool = <S extends z.ZodType>(tool: Omit<ReadTool<S>, 'kind'>) =>
  ({ kind: 'read', ...tool }) as ReadTool;
const proposeTool = <S extends z.ZodType>(tool: Omit<ProposeTool<S>, 'kind'>) =>
  ({ kind: 'propose', ...tool }) as unknown as ProposeTool;

const noArgs = z.object({}).strict();
const atLeastOne = (value: object) => Object.values(value).some((v) => v !== undefined);

// What the owner is told will happen when something is published.
function publishEffect(s: Snapshot) {
  const live = s.presence.listings.filter((l) => l.live).length;
  return s.publishing
    ? `Published to Yext as soon as you confirm, then on to the sites you're live on (${live}).`
    : 'Saved in Connecta AI. It goes live once publishing to Yext is connected.';
}

// --- Read tools -------------------------------------------------------------------------------------------------

const getBusinessProfile = readTool({
  name: 'get_business_profile',
  description: 'The business card: name, contact details, description, weekly and upcoming special hours.',
  args: '{}',
  capability: 'business.read',
  schema: noArgs,
  run: ({ snapshot: s }) => {
    const b = s.business;
    return ok({
      summary: 'business profile',
      data: {
        name: cleanText(b.name, 120),
        category: b.category,
        address: `${cleanText(b.addressLine1, 200)}, ${b.postalCode} ${b.city}`,
        phone: b.phone,
        website: b.website,
        description: cleanText(b.description, 800),
        weekly_hours: weekToText(b.hours),
        upcoming_special_hours: s.exceptions,
        source: b.source,
        publishing_connected: s.publishing,
      },
    });
  },
});

const getVisibility = readTool({
  name: 'get_visibility',
  description:
    'One visibility score with every check behind it (done or not, points, detail). area: profile, local_search or ai_visibility.',
  args: '{ "area": "profile" | "local_search" | "ai_visibility" }',
  capability: 'business.read',
  schema: z.object({ area: z.enum(['profile', 'local_search', 'ai_visibility']) }).strict(),
  run: ({ snapshot: s }, { area }) => {
    const report =
      area === 'profile' ? s.presence.profile : area === 'local_search' ? s.presence.search : s.presence.ai;
    return ok({
      summary: `${area} score ${report.score}`,
      data: {
        area,
        score: report.score,
        checks: report.checks.map((c) => ({
          label: c.label,
          done: c.done,
          points: c.points,
          detail: cleanText(c.detail, 300),
          fix_on: c.fix ?? null,
        })),
      },
    });
  },
});

const listSuggestionsTool = readTool({
  name: 'list_suggestions',
  description: 'Waiting suggestions for special days, most important first, and the latest answered ones.',
  args: '{}',
  capability: 'business.read',
  schema: noArgs,
  run: ({ snapshot: s }) =>
    ok({
      summary: `${s.suggestions.pending.length} waiting`,
      data: {
        waiting: s.suggestions.pending.map((p) => ({
          key: p.key,
          kind: p.kind,
          label: p.label,
          date: p.date,
          suggested: p.suggested,
          google_shows: p.shown,
          confidence_pct: p.confidence === null ? null : Math.round(p.confidence * 100),
          importance: p.importance,
        })),
        answered: s.suggestions.handled.slice(0, 10).map((h) => ({
          key: h.key,
          label: h.snapshot.label,
          status: h.status,
          hours: h.hours,
          via: h.via,
          published: !!h.publishedAt,
        })),
      },
    }),
});

const getSuggestion = readTool({
  name: 'get_suggestion',
  description: 'One suggestion in full: why it was made, how sure, what linked pages say, and its status.',
  args: '{ "key": "YYYY-MM-DD" | "closed-for-good" }',
  capability: 'business.read',
  schema: z.object({ key: z.string().regex(/^(\d{4}-\d{2}-\d{2}|closed-for-good)$/) }).strict(),
  run: ({ snapshot: s }, { key }) => {
    const record = selectedRecord(s, { type: 'suggestion', key });
    return record
      ? ok({ summary: `suggestion ${key}`, data: record })
      : fail('NotFound', `There is no suggestion for ${key}.`);
  },
});

const getPublishingStatus = readTool({
  name: 'get_publishing_status',
  description:
    'Where the listing is live, how fast each site updates, whether publishing to Yext is connected, and what was published lately.',
  args: '{}',
  capability: 'business.read',
  schema: noArgs,
  run: ({ snapshot: s }) =>
    ok({
      summary: `${s.presence.listings.filter((l) => l.live).length} live sites`,
      data: {
        publishing_connected: s.publishing,
        source: s.business.source,
        sites: s.presence.listings.map((l) => ({
          name: l.name,
          status: l.status,
          live: l.live,
          needs_own_account: l.needsAccount,
          update_seconds: l.seconds,
        })),
        recent_decisions: s.suggestions.handled.slice(0, 8).map((h) => ({
          key: h.key,
          status: h.status,
          via: h.via,
          decided_at: h.decidedAt?.toISOString() ?? null,
          published_at: h.publishedAt?.toISOString() ?? null,
        })),
      },
    }),
});

const getMessageSettings = readTool({
  name: 'get_message_settings',
  description:
    'How suggestions reach the owner: language, importance level, standing permission, opt-out, preferred and connected channels, contact hours.',
  args: '{}',
  capability: 'business.read',
  schema: noArgs,
  run: ({ snapshot: s }) => {
    const b = s.business;
    return ok({
      summary: 'message settings',
      data: {
        language: b.contact.language,
        min_importance: b.whatsapp.minImportance,
        standing_permission: b.contact.standingPermission,
        opted_out: b.contact.optedOut,
        preferred_channel: b.contact.channel,
        whatsapp_on: b.whatsapp.on,
        email_on: b.email.on,
        telegram_connected: !!b.telegram.chatId,
        contact_window: b.contact.window || null,
        time_zone: b.contact.timeZone,
      },
    });
  },
});

const searchGuidesTool = readTool({
  name: 'search_guides',
  description:
    "Searches Connecta AI's own guides on how the product works. Use it for how-to and why questions.",
  args: '{ "query": "a few words" }',
  capability: 'business.read',
  schema: z.object({ query: z.string().trim().min(2).max(200) }).strict(),
  run: (_, { query }) => {
    const hits = searchGuides(guides, query);
    return ok({
      summary: `${hits.length} guide sections`,
      data: hits.length
        ? hits.map(({ guide, title, section, excerpt }) => ({ guide, title, section, excerpt }))
        : { none: true, guides: guides.map((g) => ({ id: g.id, title: g.title })) },
    });
  },
});

const readGuideTool = readTool({
  name: 'read_guide',
  description: 'One guide in full, by the id search_guides returned.',
  args: '{ "id": "guide-id" }',
  capability: 'business.read',
  schema: z.object({ id: z.string().regex(/^[a-z0-9-]{2,40}$/) }).strict(),
  run: (_, { id }) => {
    const guide = findGuide(id);
    return guide
      ? ok({ summary: `guide ${id}`, data: guideText(guide) })
      : fail('NotFound', `No guide "${id}". Guides: ${guides.map((g) => g.id).join(', ')}.`);
  },
});

// --- Propose tools ----------------------------------------------------------------------------------------------

const DETAIL_LABELS = {
  name: 'Name',
  phone: 'Phone',
  website: 'Website',
  description: 'Description',
  addressLine1: 'Street address',
  postalCode: 'Postal code',
} as const;
type DetailField = keyof typeof DETAIL_LABELS;

const detailsSchema = z
  .object({
    name: businessEditSchema.shape.name.optional(),
    phone: businessEditSchema.shape.phone.optional(),
    website: businessEditSchema.shape.website.optional(),
    description: businessEditSchema.shape.description.optional(),
    addressLine1: businessEditSchema.shape.addressLine1.optional(),
    postalCode: businessEditSchema.shape.postalCode.optional(),
  })
  .strict()
  .refine(atLeastOne, { message: 'Name at least one field to change' });
type DetailsPayload = z.infer<typeof detailsSchema>;

const currentDetails = (s: Snapshot): Record<DetailField, string> => ({
  name: s.business.name,
  phone: s.business.phone,
  website: s.business.website,
  description: s.business.description,
  addressLine1: s.business.addressLine1,
  postalCode: s.business.postalCode,
});

/** saveBusiness takes the whole card; fields the change doesn't name keep their current values. */
async function saveCard(
  ctx: ToolContext,
  change: { details?: DetailsPayload; hours?: Partial<Record<Weekday, string>> },
): Promise<Result<{ message: string }, ToolError>> {
  const s = ctx.snapshot;
  const [error, result] = await saveBusiness(ctx.owner.entityId, {
    ...currentDetails(s),
    ...change.details,
    hours: { ...weekToText(s.business.hours), ...change.hours },
    links: [],
  });
  if (error)
    return error.reason === 'YextRejected'
      ? fail('YextRejected', `Google and the other sites didn't accept it: ${error.message}`)
      : fail('NotFound', 'The business was not found.');
  if (!result.changed) return ok({ message: 'Nothing needed changing: it was already like that.' });
  return ok({
    message: result.published
      ? 'Saved and published.'
      : 'Saved. It goes live once publishing to Yext is connected.',
  });
}

const proposeBusinessDetails = proposeTool({
  name: 'propose_business_details',
  description:
    'Proposes new values for business details. Only the fields given change. Shows the owner a preview; nothing is saved until they confirm.',
  args: '{ "name"?: string, "phone"?: string, "website"?: string, "description"?: string (max 600), "addressLine1"?: string, "postalCode"?: string }',
  capability: 'business.update',
  schema: detailsSchema,
  base: (s, payload: DetailsPayload) => {
    const now = currentDetails(s);
    return Object.fromEntries(Object.keys(payload).map((f) => [f, now[f as DetailField]]));
  },
  prepare: ({ snapshot: s }, payload: DetailsPayload) => {
    const diff = diffFields(
      currentDetails(s),
      payload as FieldValues,
      DETAIL_LABELS,
      (_, v) => v || '(empty)',
    );
    if (!diff.length) return fail('NoChange', 'Those values are already on the business card.');
    const effects = [publishEffect(s)];
    if (payload.description !== undefined && payload.description.length < 250)
      effects.push('Descriptions of at least 250 characters count fully towards local search.');
    // Only what changes is kept, so confirming can't overwrite a field the preview didn't show.
    const changed = Object.fromEntries(diff.map((r) => [r.field, payload[r.field as DetailField]]));
    return ok({ payload: changed, diff, effects, summary: diff.map((r) => r.label).join(', ') });
  },
  commit: (ctx, payload: DetailsPayload) => saveCard(ctx, { details: payload }),
});

const hoursText = z
  .string()
  .regex(HOURS_TEXT, { message: 'Use "closed" or HH:MM-HH:MM, e.g. "10:00-14:00,17:00-22:00"' });
const weeklySchema = z
  .object({
    hours: z
      .object(
        Object.fromEntries(WEEKDAYS.map((d) => [d, hoursText.optional()])) as Record<
          Weekday,
          z.ZodOptional<typeof hoursText>
        >,
      )
      .strict()
      .refine(atLeastOne, { message: 'Name at least one weekday' }),
  })
  .strict();
type WeeklyPayload = z.infer<typeof weeklySchema>;

const DAY_LABELS = Object.fromEntries(
  WEEKDAYS.map((d) => [d, d.charAt(0).toUpperCase() + d.slice(1)]),
) as Record<Weekday, string>;

const proposeWeeklyHours = proposeTool({
  name: 'propose_weekly_hours',
  description:
    'Proposes new regular opening hours for some weekdays (every week, not one date). Shows a preview; nothing is saved until the owner confirms.',
  args: '{ "hours": { "monday"?: "closed" | "HH:MM-HH:MM[,HH:MM-HH:MM]", ...other weekdays } }',
  capability: 'hours.update',
  schema: weeklySchema,
  base: (s, payload: WeeklyPayload) => {
    const now = weekToText(s.business.hours);
    return Object.fromEntries(Object.keys(payload.hours).map((d) => [d, now[d as Weekday]]));
  },
  prepare: ({ snapshot: s }, payload: WeeklyPayload) => {
    const diff = diffFields(weekToText(s.business.hours), payload.hours as FieldValues, DAY_LABELS, (_, v) =>
      formatHours(v),
    );
    if (!diff.length) return fail('NoChange', 'Those are already the opening hours.');
    const hours = Object.fromEntries(diff.map((r) => [r.field, payload.hours[r.field as Weekday]]));
    return ok({
      payload: { hours },
      diff,
      effects: [publishEffect(s), 'Special days that already have their own hours keep them.'],
      summary: diff.map((r) => r.label).join(', '),
    });
  },
  commit: (ctx, payload: WeeklyPayload) => saveCard(ctx, { hours: payload.hours }),
});

const answerSchema = z
  .object({
    key: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'The suggestion key is its date, YYYY-MM-DD' }),
    action: decideSchema.shape.action,
    hours: decideSchema.shape.hours,
  })
  .strict()
  .refine((a) => a.action !== 'edit' || !!a.hours, { message: 'An edit needs the hours', path: ['hours'] });
type AnswerPayload = z.infer<typeof answerSchema>;

const proposeSuggestionAnswer = proposeTool({
  name: 'propose_suggestion_answer',
  description:
    'Proposes answering a waiting special-day suggestion: approve the suggested hours, edit them, or decline. Shows a preview; nothing is published until the owner confirms.',
  args: '{ "key": "YYYY-MM-DD", "action": "approve" | "edit" | "decline", "hours"?: "closed" | "HH:MM-HH:MM" (for edit) }',
  capability: 'suggestions.answer',
  schema: answerSchema,
  base: (s, payload: AnswerPayload) => {
    const item = s.suggestions.pending.find((p) => p.key === payload.key);
    return {
      key: payload.key,
      status: item ? 'pending' : 'gone',
      suggested: item?.suggested ?? '',
      shown: item?.shown ?? '',
    };
  },
  prepare: ({ snapshot: s }, payload: AnswerPayload) => {
    if (payload.key === FLAG_KEY)
      return fail('UseTheCard', 'The closed-for-good question is answered on its card on the front page.');
    const item = s.suggestions.pending.find((p) => p.key === payload.key);
    if (!item) {
      const handled = s.suggestions.handled.some((h) => h.key === payload.key);
      return fail(
        handled ? 'AlreadyAnswered' : 'NotFound',
        handled ? 'That one is already answered.' : 'No waiting suggestion for that date.',
      );
    }
    const after =
      payload.action === 'decline'
        ? `${formatHours(item.shown)} (unchanged)`
        : formatHours(payload.action === 'edit' ? payload.hours! : (item.suggested ?? ''));
    const diff: CopilotDiffRow[] = [
      {
        field: `holiday:${item.key}`,
        label: `${item.label}, ${formatDay(item.key)}`,
        before: formatHours(item.shown),
        after,
      },
    ];
    const effects =
      payload.action === 'decline'
        ? ["Your hours stay as they are, and these hours won't be suggested for this day again."]
        : [publishEffect(s), 'Connecta AI re-checks your other special days with this answer.'];
    for (const check of item.checks.filter((c) => !c.agrees))
      effects.push(
        `Your linked page (${check.kind}) says ${showHours(check.hours)} for this day. Check before confirming.`,
      );
    return ok({
      payload: {
        key: payload.key,
        action: payload.action,
        ...(payload.action === 'edit' ? { hours: payload.hours } : {}),
      },
      diff,
      effects,
      summary: `${payload.action} ${item.key}`,
    });
  },
  commit: async (ctx, payload: AnswerPayload) => {
    const [error, result] = await decide(
      ctx.owner.entityId,
      payload.key,
      { action: payload.action, hours: payload.hours },
      'copilot',
    );
    if (error) {
      const messages: Record<string, string> = {
        AlreadyAnswered: 'This one was already answered.',
        HoursRequired: 'Enter the hours.',
        YextRejected: `Google and the other sites didn't accept it: ${'message' in error ? error.message : ''}`,
      };
      return fail(error.reason, messages[error.reason] ?? 'This suggestion is no longer open.');
    }
    // As on the dashboard: if the owner was waiting on this one in a chat channel, move that conversation along.
    const business = await getBusiness(ctx.owner.entityId);
    if (business && usesOwnChannel(business)) await sendNext(business, ctx.origin);
    const { decision } = result;
    return ok({
      message:
        decision.status === 'declined'
          ? "Got it. We won't ask about this day again."
          : publishedSummary(decision.sites),
    });
  },
});

const editAnswerSchema = z
  .object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), accept: z.boolean() })
  .strict();
type EditAnswerPayload = z.infer<typeof editAnswerSchema>;

const proposeGoogleEditAnswer = proposeTool({
  name: 'propose_google_edit_answer',
  description:
    'Proposes accepting or rejecting an edit that a Google user or another site suggested to the listing. Shows a preview first.',
  args: '{ "id": "edit id", "accept": true | false }',
  capability: 'edits.answer',
  schema: editAnswerSchema,
  base: (s, payload: EditAnswerPayload) => ({
    id: payload.id,
    waiting: s.presence.googleEdits.some((e) => e.id === payload.id) ? 'yes' : 'no',
  }),
  prepare: ({ snapshot: s }, payload: EditAnswerPayload) => {
    const edit = s.presence.googleEdits.find((e) => e.id === payload.id);
    if (!edit) return fail('NotFound', 'That suggested edit is no longer waiting.');
    const change = cleanText(edit.change, 200);
    const effects = !payload.accept
      ? ['Your listing stays as it is.']
      : edit.kind === 'closure'
        ? ['Nothing changes yet: a person at Fonecta checks before a listing is marked closed.']
        : s.business.source === 'yext' || edit.field === 'hours'
          ? [publishEffect(s)]
          : ['Your answer is saved.'];
    return ok({
      payload: { id: payload.id, accept: payload.accept },
      diff: [
        {
          field: `edit:${edit.id}`,
          label: `Suggested by ${edit.site}`,
          before: change,
          after: payload.accept ? 'Accepted' : 'Rejected',
        },
      ],
      effects,
      summary: `${payload.accept ? 'accept' : 'reject'} edit`,
    });
  },
  commit: async (ctx, payload: EditAnswerPayload) => {
    const [error, result] = await answerEdit(ctx.owner.entityId, payload.id, payload.accept);
    if (error)
      return error.reason === 'YextRejected'
        ? fail('YextRejected', `Yext didn't accept it: ${error.message}`)
        : fail('NotFound', 'This edit is no longer waiting.');
    const message = {
      published: publishedSummary(result.sites),
      saved: 'Accepted. Your hours here are updated; it goes live once publishing to Yext is connected.',
      rejected: 'Rejected. Your listing stays as it is.',
      closure: 'Thanks. A person at Fonecta will check before anything changes on your listing.',
    }[result.outcome];
    return ok({ message });
  },
});

const LANGUAGE_NAMES: Record<string, string> = {
  fi: 'Finnish',
  sv: 'Swedish',
  nb: 'Norwegian',
  en: 'English',
};
const settingsSchema = z
  .object({
    language: z.enum(languages).optional(),
    minImportance: z.enum(importances).optional(),
    standingPermission: z.boolean().optional(),
  })
  .strict()
  .refine(atLeastOne, { message: 'Name at least one setting' });
type SettingsPayload = z.infer<typeof settingsSchema>;

const currentSettings = (s: Snapshot) => ({
  language: s.business.contact.language,
  minImportance: s.business.whatsapp.minImportance,
  standingPermission: s.business.contact.standingPermission ? 'on' : 'off',
});

const proposeMessageSettings = proposeTool({
  name: 'propose_message_settings',
  description:
    "Proposes changing how suggestions reach the owner: message language, the least important suggestion that's sent, and standing permission for public holidays. Shows a preview first.",
  args: '{ "language"?: "fi" | "sv" | "nb" | "en", "minImportance"?: "low" | "medium" | "high", "standingPermission"?: boolean }',
  capability: 'messages.update',
  schema: settingsSchema,
  base: (s, payload: SettingsPayload) => {
    const now = currentSettings(s);
    return Object.fromEntries(Object.keys(payload).map((k) => [k, now[k as keyof typeof now]]));
  },
  prepare: ({ snapshot: s }, payload: SettingsPayload) => {
    const after: FieldValues = {
      ...(payload.language ? { language: payload.language } : {}),
      ...(payload.minImportance ? { minImportance: payload.minImportance } : {}),
      ...(payload.standingPermission !== undefined
        ? { standingPermission: payload.standingPermission ? 'on' : 'off' }
        : {}),
    };
    const labels = {
      language: 'Message language',
      minImportance: 'Send suggestions from',
      standingPermission: 'Handle public holidays without asking',
    };
    const diff = diffFields(currentSettings(s), after, labels, (field, v) =>
      field === 'language'
        ? (LANGUAGE_NAMES[v] ?? v)
        : field === 'minImportance'
          ? `${v} importance up`
          : v === 'on'
            ? 'On'
            : 'Off',
    );
    if (!diff.length) return fail('NoChange', 'Those are already the settings.');
    const effects = ['The same on WhatsApp, Telegram and email.'];
    if (payload.standingPermission && !s.business.contact.standingPermission)
      effects.push(
        'From now on, public-holiday suggestions at least 70% sure that no linked page disputes are published without asking, starting with any waiting now. You are told each time.',
      );
    if (payload.minImportance) effects.push('Your most important waiting suggestion may be sent to you now.');
    const changed = Object.fromEntries(diff.map((r) => [r.field, payload[r.field as keyof SettingsPayload]]));
    return ok({ payload: changed, diff, effects, summary: diff.map((r) => r.label).join(', ') });
  },
  commit: async (ctx, payload: SettingsPayload) => {
    const b = ctx.snapshot.business;
    const input = messageSettingsSchema.parse({
      language: payload.language ?? b.contact.language,
      minImportance: payload.minImportance ?? b.whatsapp.minImportance,
      standingPermission: payload.standingPermission ?? b.contact.standingPermission,
    });
    const [error, result] = await saveMessageSettings(ctx.owner.entityId, input, ctx.origin);
    if (error) return fail('NotFound', 'The business was not found.');
    const parts = ['Saved.'];
    if (result.applied)
      parts.push(`${result.applied} holiday ${result.applied === 1 ? 'day' : 'days'} updated.`);
    if (result.sent) parts.push('Your most important suggestion is on its way.');
    return ok({ message: parts.join(' ') });
  },
});

const contactArgsSchema = z
  .object({ optedOut: z.boolean().optional(), preferredChannel: z.enum(contactChannels).optional() })
  .strict()
  .refine(atLeastOne, { message: 'Name at least one preference' });
type ContactArgs = z.infer<typeof contactArgsSchema>;

const proposeContactPreferences = proposeTool({
  name: 'propose_contact_preferences',
  description:
    "Proposes turning suggestion messages off or on (optedOut) or changing the preferred channel in the owner's customer record. Shows a preview first.",
  args: '{ "optedOut"?: boolean, "preferredChannel"?: "EMAIL" | "SMS" | "WHATSAPP" | "APP_PUSH" | "TELEGRAM" }',
  capability: 'contact.update',
  schema: contactArgsSchema,
  base: (s, payload: ContactArgs) => {
    const now = {
      optedOut: s.business.contact.optedOut ? 'yes' : 'no',
      preferredChannel: s.business.contact.channel,
    };
    return Object.fromEntries(Object.keys(payload).map((k) => [k, now[k as keyof typeof now]]));
  },
  prepare: ({ snapshot: s }, payload: ContactArgs) => {
    const before = {
      optedOut: s.business.contact.optedOut ? 'yes' : 'no',
      preferredChannel: s.business.contact.channel,
    };
    const after: FieldValues = {
      ...(payload.optedOut !== undefined ? { optedOut: payload.optedOut ? 'yes' : 'no' } : {}),
      ...(payload.preferredChannel ? { preferredChannel: payload.preferredChannel } : {}),
    };
    const diff = diffFields(
      before,
      after,
      { optedOut: 'Suggestion messages', preferredChannel: 'Preferred channel' },
      (field, v) => (field === 'optedOut' ? (v === 'yes' ? 'Off' : 'On') : v),
    );
    if (!diff.length) return fail('NoChange', 'Those are already the preferences.');
    const effects =
      payload.optedOut === true
        ? ['No suggestion messages on any channel. Suggestions still show on the dashboard.']
        : ['Your next suggestion may be sent within your contact hours.'];
    const changed = Object.fromEntries(diff.map((r) => [r.field, payload[r.field as keyof ContactArgs]]));
    return ok({ payload: changed, diff, effects, summary: diff.map((r) => r.label).join(', ') });
  },
  commit: async (ctx, payload: ContactArgs) => {
    const input = contactSchema.parse(payload);
    const [error] = await saveContact(ctx.owner.entityId, input, ctx.origin);
    if (error?.reason === 'NotFound') return fail('NotFound', 'The business was not found.');
    return ok({
      message: input.optedOut ? "Saved. We won't send you suggestion messages." : 'Saved.',
    });
  },
});

// --- Registry ---------------------------------------------------------------------------------------------------

export const TOOLS: Tool[] = [
  getBusinessProfile,
  getVisibility,
  listSuggestionsTool,
  getSuggestion,
  getPublishingStatus,
  getMessageSettings,
  searchGuidesTool,
  readGuideTool,
  proposeBusinessDetails,
  proposeWeeklyHours,
  proposeSuggestionAnswer,
  proposeGoogleEditAnswer,
  proposeMessageSettings,
  proposeContactPreferences,
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

/** The tools this account may use, for the prompt. Others aren't even mentioned to the model. */
export const toolsFor = (capabilities: Capability[]) =>
  TOOLS.filter((t) => capabilities.includes(t.capability));

export type Authorized =
  | { kind: 'read'; tool: ReadTool; args: unknown }
  | { kind: 'propose'; tool: ProposeTool; args: Record<string, unknown> };

/**
 * The server's check on a tool request from the model: is it on the allowlist, may this account use it, and are the
 * arguments valid. The model's word counts for nothing here.
 */
export function authorize(
  name: string,
  rawArgs: unknown,
  capabilities: Capability[],
): Result<Authorized, ToolError> {
  const tool = byName.get(name);
  if (!tool) return fail('UnknownTool', `There is no tool "${name}".`);
  if (!capabilities.includes(tool.capability)) return fail('NotAllowed', `This account can't use ${name}.`);
  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success)
    return fail(
      'InvalidArguments',
      parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`)
        .join('; '),
    );
  return tool.kind === 'read'
    ? ok({ kind: 'read', tool, args: parsed.data })
    : ok({ kind: 'propose', tool, args: parsed.data as Record<string, unknown> });
}

export const findProposeTool = (name: string) => {
  const tool = byName.get(name);
  return tool?.kind === 'propose' ? tool : null;
};

/** A read tool's result as the model gets it: bounded JSON. */
export function observation(name: string, result: Result<ReadResult, ToolError>) {
  const [error, value] = result;
  const body = error
    ? { tool: name, error: error.reason, message: error.message }
    : { tool: name, result: value.data };
  return JSON.stringify(fitToBudget(body, TOOL_RESULT_BUDGET).value ?? { tool: name, error: 'TooLarge' });
}
