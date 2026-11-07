// Which suggestion the owner should see first: a likely-right change on a day many people look the business up,
// sooner rather than later.

export type Importance = 'high' | 'medium' | 'low';

export function importanceScore(input: { confidence: number; views: number; daysUntil: number }): number {
  const urgency = input.daysUntil <= 7 ? 2 : input.daysUntil <= 30 ? 1.25 : 1;
  return input.confidence * Math.max(input.views, 1) * urgency;
}

/** The label for a score, relative to this business's top suggestion. */
export function importanceLabel(score: number, top: number): Importance {
  if (score >= top * 0.66) return 'high';
  return score >= top * 0.33 ? 'medium' : 'low';
}
