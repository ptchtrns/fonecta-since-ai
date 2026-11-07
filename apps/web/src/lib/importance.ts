// Which suggestion the owner should see first: a likely-right change on a day many people look the business up,
// sooner rather than later.
import type { importances } from '~/db/schema';

export type Importance = (typeof importances)[number];

const rank: Record<Importance, number> = { low: 0, medium: 1, high: 2 };

/** Whether a suggestion is at least as important as the owner's threshold. */
export const meetsImportance = (importance: Importance, min: Importance) => rank[importance] >= rank[min];

export function importanceScore(input: { confidence: number; views: number; daysUntil: number }): number {
  const urgency = input.daysUntil <= 7 ? 2 : input.daysUntil <= 30 ? 1.25 : 1;
  return input.confidence * Math.max(input.views, 1) * urgency;
}

/** The label for a score, relative to this business's top suggestion. */
export function importanceLabel(score: number, top: number): Importance {
  if (score >= top * 0.66) return 'high';
  return score >= top * 0.33 ? 'medium' : 'low';
}
