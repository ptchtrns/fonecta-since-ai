// How a suggestion reads on the dashboard and the owner's link: one question as the headline, what's at stake for
// customers, and buttons that say what happens when tapped.
import { formatHours } from '~/lib/hours';

export const suggestsClosed = (suggested: string | null) => suggested === 'closed';

/** "Confirm your Christmas Day hours". */
export function suggestionHeadline(label: string): string {
  return `Confirm your ${label} hours`;
}

/** "~18 people", or null when there's nothing to go on. */
export function expectedLookups(views: number | null | undefined): string | null {
  const n = Math.round(views ?? 0);
  if (n < 1) return null;
  return n === 1 ? '~1 person' : `~${n} people`;
}

/** The rest of the impact sentence, after the number of people. */
export function impactRest(views: number): string {
  return `${Math.round(views) === 1 ? 'is' : 'are'} expected to look you up that day. Keep your hours right so nobody makes a wasted trip.`;
}

/** Button labels for an hours suggestion. */
export function answerLabels(suggested: string | null) {
  const closed = suggestsClosed(suggested);
  return {
    confirm: closed ? 'Confirm closed' : `Confirm ${formatHours(suggested ?? '')}`,
    edit: closed ? "We're open (edit hours)" : 'Different hours (edit)',
    dismiss: 'Dismiss',
    dismissHint: "Keep what Google shows now and don't ask about this day again",
    save: 'Save my hours',
  };
}
