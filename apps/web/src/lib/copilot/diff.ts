// Edit previews: what a proposed change would do, field by field, and a fingerprint of the values it starts from so
// a confirmation can tell whether something changed in between.
import type { CopilotDiffRow } from '~/db/schema';

export type FieldValues = Record<string, string>;

/** Rows for the fields whose value would change, in the order of `labels`. */
export function diffFields(
  before: FieldValues,
  after: FieldValues,
  labels: Record<string, string>,
  show: (field: string, value: string) => string = (_, v) => v,
): CopilotDiffRow[] {
  return Object.keys(labels)
    .filter((field) => field in after && (before[field] ?? '') !== after[field])
    .map((field) => ({
      field,
      label: labels[field]!,
      before: show(field, before[field] ?? ''),
      after: show(field, after[field]!),
    }));
}

/** JSON with object keys sorted, so the same values always give the same text. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** SHA-256 of the values, hex. Web Crypto, which Workers, browsers and Node all have. */
export async function hashValues(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
