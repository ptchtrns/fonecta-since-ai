import 'server-only';
import { formatHours, weekToText } from '~/lib/hours';
import { suggestionStats } from '~/lib/report';
import { fitEnvelope, fitHistory, SECTION_BUDGETS, type HistoryTurn } from '~/lib/copilot/budget';
import { hashValues } from '~/lib/copilot/diff';
import { cleanText, hostOf, looksLikeInjection, maskThirdPartyText } from '~/lib/copilot/sanitize';
import {
  CONTEXT_VERSION,
  copilotRoutes,
  type Capability,
  type CopilotRoute,
  type CopilotSelection,
} from '~/lib/copilot/types';
import type { SessionUser } from '~/server/auth';
import { publishes } from '~/server/yext';
import { getBusiness, type Business } from '~/services/business.service';
import { canContactNow, connectedChannels } from '~/services/contact.service';
import type { Owner } from '~/services/copilot-store.service';
import { getPresence } from '~/services/presence.service';
import { listLinkedSources } from '~/services/sources.service';
import { listSuggestions, upcomingExceptions } from '~/services/suggestions.service';
import { getTrafficReport } from '~/services/traffic.service';

// What the copilot knows on one turn. It's read from the same domain services the dashboard uses, once per turn, so
// the model always works from current data; tools read from this snapshot rather than asking again. The envelope
// sent to the model picks fields explicitly: anything not named here (owner's email and phone, tokens, the account's
// email, linked pages' addresses, other businesses) never reaches it.

/**
 * What the signed-in account may do. Today an account manages exactly one business and may do everything the
 * dashboard offers for it, so this is all or nothing; it's still a list so that tools and commits name the
 * permission they need, and roles can narrow it later without touching them.
 */
export function capabilitiesFor(user: Pick<SessionUser, 'entityId'> | null, entityId: string): Capability[] {
  if (!user || !user.entityId || user.entityId !== entityId) return [];
  return [
    'business.read',
    'business.update',
    'hours.update',
    'suggestions.answer',
    'edits.answer',
    'messages.update',
    'contact.update',
  ];
}

export type Snapshot = NonNullable<Awaited<ReturnType<typeof loadSnapshot>>>;

/** The business and everything the dashboard shows about it, or null when it no longer exists. */
export async function loadSnapshot(owner: Owner) {
  const business = await getBusiness(owner.entityId);
  if (!business) return null;
  const [presence, suggestions, traffic, exceptions, linked] = await Promise.all([
    getPresence(business),
    listSuggestions(business),
    getTrafficReport(business),
    upcomingExceptions(business),
    listLinkedSources(business.id),
  ]);
  return {
    business,
    presence,
    suggestions,
    traffic,
    exceptions,
    linked,
    publishing: publishes(business.source),
    loadedAt: new Date(),
  };
}

/** A page path the copilot knows, or null. Query strings, hashes and unknown paths are dropped. */
export function normalizeRoute(route: string): CopilotRoute | null {
  const path = route.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
  return (copilotRoutes as readonly string[]).includes(path) ? (path as CopilotRoute) : null;
}

/** Local time at the business, e.g. "Sunday 8 November 2026, 14:05". */
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

/** Fields the copilot may propose changes to, for the envelope's `business.editable_fields`. */
export function editableFields(capabilities: Capability[]) {
  return [
    ...(capabilities.includes('business.update')
      ? ['name', 'phone', 'website', 'description', 'addressLine1', 'postalCode']
      : []),
    ...(capabilities.includes('hours.update') ? ['weekly_hours'] : []),
  ];
}

const pct = (n: number | null) => (n === null ? null : Math.round(n * 100));

/** The business section: its public listing data. Name and description are the owner's text: cleaned, bounded. */
function businessSection(s: Snapshot, capabilities: Capability[]) {
  const b = s.business;
  return {
    id: b.id,
    name: cleanText(b.name, 120),
    category: b.category,
    city: b.city,
    country: b.country,
    timezone: b.timezone,
    local_time: localTime(b.timezone),
    address: cleanText(b.addressLine1, 200),
    postal_code: cleanText(b.postalCode, 12),
    phone: cleanText(b.phone, 30),
    website: cleanText(b.website, 200),
    description: cleanText(b.description, 700),
    weekly_hours: weekToText(b.hours),
    upcoming_special_hours: s.exceptions
      .slice(0, 12)
      .map((e) => ({ date: e.date, label: e.label, hours: e.hours })),
    // Hosts only: full addresses can carry tracking parameters, and the model never opens them.
    linked_pages: s.linked.map((l) => ({
      host: hostOf(l.url),
      status: l.status,
      dates_found: Object.keys(l.findings).length,
    })),
    source: b.source,
    publishing_connected: s.publishing,
    editable_fields: editableFields(capabilities),
  };
}

function suggestionDetail(s: Snapshot, key: string) {
  const item = s.suggestions.pending.find((p) => p.key === key);
  if (item)
    return {
      type: 'suggestion',
      key: item.key,
      kind: item.kind,
      label: item.label,
      date: item.date,
      status: 'pending',
      google_shows: item.shown,
      suggested: item.suggested,
      confidence_pct: pct(item.confidence),
      importance: item.importance,
      expected_lookups: item.views,
      public_holiday: item.publicHoliday,
      reasons: item.reasons.slice(0, 5).map((r) => cleanText(r, 300)),
      linked_pages: item.checks.map((c) => ({ kind: c.kind, says: c.hours, agrees: c.agrees })),
      sent_to_owner: !!item.sentAt,
    };
  const handled = s.suggestions.handled.find((h) => h.key === key);
  if (handled)
    return {
      type: 'suggestion',
      key: handled.key,
      label: handled.snapshot.label,
      status: handled.status,
      answered_hours: handled.hours,
      answered_via: handled.via,
      published: !!handled.publishedAt,
      suggested: handled.snapshot.suggested,
      google_showed: handled.snapshot.shown,
      reasons: handled.snapshot.reasons.slice(0, 3).map((r) => cleanText(r, 300)),
    };
  return null;
}

/** The record the owner had selected, looked up here by its id. Unknown ids give null. */
export function selectedRecord(s: Snapshot, selection: CopilotSelection) {
  if (!selection) return null;
  if (selection.type === 'suggestion') return suggestionDetail(s, selection.key);
  const edit = s.presence.googleEdits.find((e) => e.id === selection.id);
  return edit
    ? {
        type: 'google_edit',
        id: edit.id,
        site: edit.site,
        field: edit.field,
        change: cleanText(edit.change, 300),
      }
    : null;
}

/** Scores, gaps, suggestions, publishing, traffic and message settings: the dashboard in brief. */
function workspaceSection(s: Snapshot) {
  const { presence, suggestions, traffic, business } = s;
  const stats = suggestionStats(suggestions.pending.length, suggestions.handled);
  const missing = [
    ...presence.profile.checks.map((c) => ({ ...c, area: 'profile' })),
    ...presence.search.checks.map((c) => ({ ...c, area: 'local_search' })),
    ...presence.ai.checks.map((c) => ({ ...c, area: 'ai_visibility' })),
  ]
    .filter((c) => !c.done)
    .sort((a, b) => b.points - a.points)
    .map((c) => ({ area: c.area, check: c.key, label: c.label, points: c.points, fix_on: c.fix ?? null }));
  const live = presence.listings.filter((l) => l.live);
  return {
    scores: {
      profile: presence.profile.score,
      local_search: presence.search.score,
      ai_visibility: presence.ai.score,
    },
    missing,
    open_now: presence.openingNow,
    holidays_without_hours: presence.missingHolidays
      .slice(0, 8)
      .map((h) => ({ date: h.date, label: h.label })),
    suggestions: {
      waiting: suggestions.pending.length,
      // Most important first; `key` is what propose_suggestion_answer takes.
      top: suggestions.pending.slice(0, 6).map((p) => ({
        key: p.key,
        kind: p.kind,
        label: p.label,
        date: p.date,
        suggested: p.suggested,
        google_shows: p.shown,
        confidence_pct: pct(p.confidence),
        importance: p.importance,
        linked_page_disagrees: p.checks.some((c) => !c.agrees),
      })),
      answered: {
        total: stats.answered,
        published: stats.published,
        saved_not_live: stats.approvedNotLive,
        declined: stats.declined,
        automatic: stats.automatic,
      },
    },
    google_edits: presence.googleEdits.slice(0, 6).map((e) => ({
      id: e.id,
      site: e.site,
      field: e.field,
      change: cleanText(e.change, 200),
    })),
    listings: {
      live: live.length,
      total: presence.listings.length,
      not_live: presence.listings.filter((l) => !l.live).map((l) => `${l.name} (${l.status.toLowerCase()})`),
    },
    reviews: {
      count: presence.reviews.count,
      average: Math.round(presence.reviews.averageRating * 10) / 10,
      // Strangers' text: contact details masked, short, and marked as data in the prompt.
      recent: presence.reviews.recent.slice(0, 3).map((r) => ({
        rating: r.rating,
        date: r.date,
        text: cleanText(maskThirdPartyText(r.content), 200),
      })),
    },
    traffic: traffic.traffic
      ? {
          days: traffic.traffic.days,
          to: traffic.traffic.to,
          views: traffic.traffic.totals.views,
          searches: traffic.traffic.totals.searches,
          actions: traffic.traffic.totals.actions,
          calls: traffic.traffic.totals.calls,
          views_change_pct: pct(traffic.traffic.change.views),
        }
      : { unavailable: traffic.unavailable },
    messages: {
      language: business.contact.language,
      min_importance: business.whatsapp.minImportance,
      standing_permission: business.contact.standingPermission,
      opted_out: business.contact.optedOut,
      preferred_channel: business.contact.channel,
      // Channel names only: the owner's addresses and numbers stay out.
      connected_channels: connectedChannels(business),
      contact_window: business.contact.window || null,
      reachable_now: canContactNow(business),
    },
  };
}

/** Fingerprint of what the answer was based on, kept with the answer. */
export function snapshotHash(s: Snapshot) {
  const b = s.business;
  return hashValues({
    business: [b.name, b.phone, b.website, b.description, b.addressLine1, b.postalCode, weekToText(b.hours)],
    exceptions: s.exceptions,
    pending: s.suggestions.pending.map((p) => [p.key, p.suggested]),
    edits: s.presence.googleEdits.map((e) => e.id),
    messages: [
      b.contact.language,
      b.whatsapp.minImportance,
      b.contact.standingPermission,
      b.contact.optedOut,
    ],
  });
}

/** Text in the envelope that strangers or the owner wrote and that reads like instructions. Logged, not blocked. */
function injectionFlags(s: Snapshot, request: string) {
  const fields: [string, string][] = [
    ['business.name', s.business.name],
    ['business.description', s.business.description],
    ...s.presence.reviews.recent.map((r, i): [string, string] => [`review.${i}`, r.content]),
    ...s.presence.googleEdits.map((e): [string, string] => [`google_edit.${e.id}`, e.change]),
    ...s.suggestions.pending.flatMap((p) =>
      p.reasons.map((r, i): [string, string] => [`reason.${p.key}.${i}`, r]),
    ),
    ['request', request],
  ];
  return fields.filter(([, text]) => looksLikeInjection(text)).map(([field]) => field);
}

export type EnvelopeInput = {
  snapshot: Snapshot;
  capabilities: Capability[];
  allowedTools: string[];
  route: CopilotRoute | null;
  tab: string | null;
  selection: CopilotSelection;
  summary: string;
  history: HistoryTurn[];
  request: string;
};

/** The versioned context envelope (docs/COPILOT.md §4), fitted to its budgets. */
export async function buildEnvelope(input: EnvelopeInput) {
  const { snapshot: s } = input;
  const history = fitHistory(input.history, SECTION_BUDGETS.recent_history);
  const fitted = fitEnvelope({
    user: {
      capabilities: input.capabilities,
      language: s.business.contact.language,
      first_name: cleanText(s.business.owner, 40),
    },
    page: {
      route: input.route,
      tab: input.route === '/dashboard/visibility' ? cleanText(input.tab ?? '', 20) || null : null,
      selection: input.selection,
    },
    business: businessSection(s, input.capabilities),
    selected_record: selectedRecord(s, input.selection),
    workspace: workspaceSection(s),
    allowed_operations: input.allowedTools,
    summary: input.summary ? cleanText(input.summary, SECTION_BUDGETS.summary) : null,
    recent_history: history.turns,
    request: { text: cleanText(input.request, SECTION_BUDGETS.request) },
  });
  const hash = await snapshotHash(s);
  const envelope = {
    context_version: CONTEXT_VERSION,
    generated_at: s.loadedAt.toISOString(),
    data_hash: hash.slice(0, 16),
    // An account manages one business, so the business is the tenant.
    tenant: { id: s.business.id },
    ...fitted.sections,
    constraints: {
      external_actions: false,
      web_access: false,
      confirmation_required: true,
      direct_writes: false,
      history_dropped: history.dropped,
      truncated_sections: fitted.truncated,
    },
  };
  return { envelope, hash, flags: injectionFlags(s, input.request) };
}

/** Plain-language hours for previews: "Closed", "10:00–14:00". */
export const showHours = (text: string) => (text ? formatHours(text) : '(none)');

export type { Business };
