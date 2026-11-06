import { Show } from 'solid-js';
import { FormField } from '~/components/FormField';
import { FormMessage } from '~/components/FormMessage';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { changePasswordSchema } from '~/schemas/settings.schema';

export function PasswordForm() {
  const form = createFormState();

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const formElement = event.currentTarget as HTMLFormElement;
    const payload = form.validate(changePasswordSchema, Object.fromEntries(new FormData(formElement)));
    if (!payload) return;

    return form.submit(async () => {
      const { message } = await apiSend('/api/settings/password', 'POST', payload);
      formElement.reset();
      return message;
    });
  }

  return (
    <section class="card card-border border-base-300 bg-base-100">
      <form class="card-body gap-4" onSubmit={onSubmit} novalidate>
        <h2 class="card-title">Password</h2>
        <FormMessage message={form.message()} />
        <FormField label="Current password" error={form.fieldErrors().oldPassword}>
          <input name="oldPassword" type="password" class="input w-full" autocomplete="current-password" />
        </FormField>
        <FormField label="New password" error={form.fieldErrors().newPassword} hint="At least 8 characters">
          <input name="newPassword" type="password" class="input w-full" autocomplete="new-password" />
        </FormField>
        <div class="card-actions justify-end">
          <button type="submit" class="btn btn-primary" disabled={form.pending()}>
            <Show when={form.pending()}>
              <span class="loading loading-spinner loading-sm" />
            </Show>
            Change password
          </button>
        </div>
      </form>
    </section>
  );
}
