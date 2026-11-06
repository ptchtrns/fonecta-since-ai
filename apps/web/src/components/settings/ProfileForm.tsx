import { revalidate } from '@solidjs/router';
import { createMemo, refresh, Show } from 'solid-js';
import { FormField } from '~/components/FormField';
import { FormMessage } from '~/components/FormMessage';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { requireUser, userKeys } from '~/queries/session';
import { updateProfileSchema } from '~/schemas/settings.schema';

export function ProfileForm() {
  const user = createMemo(() => requireUser());
  const form = createFormState();

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement));
    const payload = form.validate(updateProfileSchema, input);
    if (!payload) return;

    return form.submit(
      async () => {
        const { message } = await apiSend('/api/settings/profile', 'PATCH', payload);
        return message;
      },
      () => {
        revalidate(userKeys);
        return refresh(user);
      },
    );
  }

  return (
    <section class="card card-border border-base-300 bg-base-100">
      <form class="card-body gap-4" onSubmit={onSubmit} novalidate>
        <h2 class="card-title">Profile</h2>
        <FormMessage message={form.message()} />
        <FormField label="Email" hint="Email changes are not supported in this template">
          <input type="email" class="input w-full" value={user().email} disabled />
        </FormField>
        <FormField label="Name" error={form.fieldErrors().name}>
          <input
            name="name"
            type="text"
            class="input w-full"
            defaultValue={user().name}
            autocomplete="name"
          />
        </FormField>
        <div class="card-actions justify-end">
          <button type="submit" class="btn btn-primary" disabled={form.pending()}>
            <Show when={form.pending()}>
              <span class="loading loading-spinner loading-sm" />
            </Show>
            Save
          </button>
        </div>
      </form>
    </section>
  );
}
