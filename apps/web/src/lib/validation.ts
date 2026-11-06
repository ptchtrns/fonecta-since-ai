import type { z } from 'zod';
import type { FieldErrors } from '~/lib/api';

/**
 * Splits a ZodError into a root message and per-field messages.
 * Issues on fields outside `allowedFields` are folded into the root message.
 * Used by API handlers and by forms that validate before sending.
 */
export function handleValidationError(
  error: z.ZodError,
  allowedFields: readonly string[],
): { root?: string; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  let root: string | undefined;

  for (const issue of error.issues) {
    const field = issue.path.join('.');
    if (field && allowedFields.includes(field)) {
      fieldErrors[field] ??= issue.message;
    } else {
      // A root-level issue means the body itself was missing or not an object.
      root ??= field ? issue.message : 'Invalid request body';
    }
  }

  return { root, fieldErrors };
}
