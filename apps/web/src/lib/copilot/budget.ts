// How much of each part of the context reaches the model. Budgets are in characters of compact JSON, which is what is
// sent; at roughly four characters a token for the Nordic languages and English mixed, the whole envelope stays under
// about 5,000 tokens, leaving room for the system prompt, tool results and the answer within the models' context.

import { cleanText } from './sanitize';

export const SECTION_BUDGETS = {
  user: 600,
  page: 300,
  business: 2_500,
  selected_record: 1_500,
  workspace: 5_000,
  allowed_operations: 1_800,
  summary: 1_200,
  recent_history: 6_000,
  request: 1_200,
} as const;
export type Section = keyof typeof SECTION_BUDGETS;

/** The whole envelope. Sections are shrunk below their own budgets, in `DROP_ORDER`, until it fits. */
export const ENVELOPE_BUDGET = 20_000;
/** What gives way first when the envelope is over budget. The rest is never cut below its own budget. */
export const DROP_ORDER: Section[] = [
  'workspace',
  'recent_history',
  'selected_record',
  'summary',
  'business',
];

/** One tool result as the model sees it. */
export const TOOL_RESULT_BUDGET = 4_000;
/** Each earlier message in the history. The latest answer keeps more, since follow-ups refer to it. */
export const HISTORY_TURN_BUDGET = 800;
export const LATEST_TURN_BUDGET = 1_600;

export const estimateTokens = (chars: number) => Math.ceil(chars / 4);
export const sizeOf = (value: unknown) => JSON.stringify(value)?.length ?? 0;

type Slot = { size: number; shrink: () => void };

/** The biggest array or long string in `node`, as something that can be made smaller. */
function biggest(node: unknown): Slot | null {
  let best: Slot | null = null;
  const consider = (slot: Slot) => {
    if (!best || slot.size > best.size) best = slot;
  };
  const visit = (value: unknown, parent: Record<string | number, unknown> | null, key: string | number) => {
    if (Array.isArray(value)) {
      if (value.length) consider({ size: sizeOf(value), shrink: () => void value.pop() });
      value.forEach((item, i) => visit(item, value as unknown as Record<number, unknown>, i));
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) visit(v, value as Record<string, unknown>, k);
    } else if (typeof value === 'string' && value.length > 40 && parent) {
      consider({
        size: value.length,
        shrink: () => {
          parent[key] = `${value.slice(0, Math.floor(value.length * 0.6)).trimEnd()}…`;
        },
      });
    }
  };
  visit(node, null, '');
  return best;
}

/**
 * The value cut down to `max` characters of JSON: the last items of the longest lists go first, then long texts are
 * shortened. Lists are ordered most important first by whoever builds them, so the tail is what matters least.
 * Returns null when even the empty skeleton doesn't fit.
 */
export function fitToBudget<T>(value: T, max: number): { value: T | null; trimmed: boolean } {
  if (sizeOf(value) <= max) return { value, trimmed: false };
  const box = { value: structuredClone(value) };
  for (let guard = 0; guard < 2_000 && sizeOf(box.value) > max; guard++) {
    const slot = biggest(box);
    if (!slot) break;
    slot.shrink();
  }
  return sizeOf(box.value) <= max ? { value: box.value, trimmed: true } : { value: null, trimmed: true };
}

export type HistoryTurn = { role: 'user' | 'assistant'; content: string };

/**
 * The most recent turns that fit in `max` characters, oldest first. Each is cleaned and capped; the newest answer
 * keeps more. `dropped` counts the turns left out, which the conversation summary covers.
 */
export function fitHistory(turns: HistoryTurn[], max: number) {
  const kept: HistoryTurn[] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]!;
    const cap = i === turns.length - 1 ? LATEST_TURN_BUDGET : HISTORY_TURN_BUDGET;
    const content = cleanText(turn.content, cap);
    const size = sizeOf({ role: turn.role, content });
    if (used + size > max) break;
    used += size;
    kept.unshift({ role: turn.role, content });
  }
  return { turns: kept, dropped: turns.length - kept.length };
}

/**
 * Shrinks sections in `DROP_ORDER` until the whole fits `total`. Each section is first fitted to its own budget;
 * a section that can't be is replaced by null and listed in `truncated`.
 */
export function fitEnvelope<T extends Partial<Record<Section, unknown>>>(
  sections: T,
  total = ENVELOPE_BUDGET,
) {
  const out = { ...sections } as Record<string, unknown>;
  const truncated = new Set<Section>();
  for (const key of Object.keys(SECTION_BUDGETS) as Section[]) {
    if (!(key in out)) continue;
    const fitted = fitToBudget(out[key], SECTION_BUDGETS[key]);
    if (fitted.trimmed) truncated.add(key);
    out[key] = fitted.value;
  }
  for (const key of DROP_ORDER) {
    const over = sizeOf(out) - total;
    if (over <= 0) break;
    if (!(key in out) || out[key] === null) continue;
    const fitted = fitToBudget(out[key], Math.max(0, sizeOf(out[key]) - over));
    out[key] = fitted.value;
    truncated.add(key);
  }
  return { sections: out as { [K in keyof T]: T[K] | null }, truncated: [...truncated] };
}
