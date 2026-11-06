import { action, createOptimistic, createSignal } from 'solid-js';
import type { z } from 'zod';
import { ApiError, type FieldErrors } from '~/lib/api';
import { handleValidationError } from '~/lib/validation';

export type FormMessage = { type: 'success' | 'error'; text: string };

/** Pending flag, field errors and a status message for a form backed by an API call. */
export function createFormState() {
  const [pending, setPending] = createOptimistic(false);
  const [fieldErrors, setFieldErrors] = createSignal<FieldErrors>({});
  const [message, setMessage] = createSignal<FormMessage | null>(null);

  /** Validates input locally first so users get instant feedback, then runs the request. */
  function validate<S extends z.ZodObject>(schema: S, input: unknown): z.infer<S> | null {
    const result = schema.safeParse(input);
    if (result.success) return result.data;
    const { root, fieldErrors } = handleValidationError(result.error, Object.keys(schema.shape));
    setFieldErrors(fieldErrors);
    setMessage(root ? { type: 'error', text: root } : null);
    return null;
  }

  /**
   * Runs a request. A returned string is shown as a success message. `confirm` runs after the
   * request succeeds and can return a promise, usually a refetch: the form stays pending until it
   * settles, and the outcome appears together with the fresh data.
   */
  const submit = action(function* (
    task: () => Promise<string | void>,
    confirm?: () => Promise<unknown> | void,
  ) {
    setPending(true);
    setFieldErrors({});
    setMessage(null);
    try {
      const text: string | void = yield task();
      if (confirm) yield confirm();
      if (text) setMessage({ type: 'success', text });
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors);
        if (error.body.message) setMessage({ type: 'error', text: error.body.message });
      } else {
        setMessage({ type: 'error', text: 'Something went wrong, try again' });
      }
    }
  });

  return {
    pending,
    // Writes made during a submit land when it settles, so hide the previous outcome until then.
    fieldErrors: () => (pending() ? {} : fieldErrors()),
    message: () => (pending() ? null : message()),
    validate,
    submit,
    setMessage,
  };
}
