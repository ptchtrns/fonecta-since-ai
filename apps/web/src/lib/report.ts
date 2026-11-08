// What happened to the suggestions so far, for the Reports page and the front page.
import type { DecisionChannel, SuggestionStatus } from '~/db/schema';

type Answered = {
  status: SuggestionStatus;
  via: DecisionChannel | null;
  publishedAt: string | Date | null;
};

export const CHANNELS: { via: DecisionChannel; label: string }[] = [
  { via: 'whatsapp', label: 'WhatsApp' },
  { via: 'telegram', label: 'Telegram' },
  { via: 'dashboard', label: 'Dashboard' },
  { via: 'copilot', label: 'Connecta AI copilot' },
  { via: 'link', label: 'Link in message' },
  { via: 'standing', label: 'Automatically' },
];

export function suggestionStats(waiting: number, handled: Answered[]) {
  const yes = (h: Answered) => h.status === 'approved' || h.status === 'edited';
  // Applied under standing permission: nobody was asked, so it says nothing about how the owner answers.
  const byOwner = handled.filter((h) => h.via !== 'standing');
  const said = byOwner.filter(yes).length;
  const declined = byOwner.filter((h) => h.status === 'declined').length;
  const published = handled.filter((h) => h.publishedAt);
  const approved = handled.filter(yes);
  return {
    suggested: waiting + handled.length,
    waiting,
    answered: handled.length,
    published: published.length,
    publishedAfterEdit: published.filter((h) => h.status === 'edited').length,
    /** Said yes to, but not published: Yext wasn't connected, so it's only saved here. */
    approvedNotLive: approved.filter((h) => !h.publishedAt).length,
    declined,
    /** Share of the owner's own answers that were yes, or null before the first one. */
    yesRate: said + declined ? said / (said + declined) : null,
    automatic: handled.filter((h) => h.via === 'standing' && yes(h)).length,
    byChannel: CHANNELS.map((c) => ({ ...c, count: handled.filter((h) => h.via === c.via).length })),
  };
}
export type SuggestionStats = ReturnType<typeof suggestionStats>;

/**
 * How many listing updates Connect sent: each published change goes to every site the business is live on. Counted
 * with today's live sites, since which sites took each change isn't recorded.
 */
export const siteUpdates = (published: number, liveSites: number) => published * liveSites;
