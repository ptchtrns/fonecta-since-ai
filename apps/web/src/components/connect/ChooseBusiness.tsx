import { revalidate } from '@solidjs/router';
import { createSignal, Show } from 'solid-js';
import { FormMessage } from '~/components/FormMessage';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { getWorkspace } from '~/queries/workspace';
import { BusinessCombobox, type BusinessOption } from './BusinessCombobox';

/** Picks the account's business: shown to accounts that don't have one, and in Account to change it. */
export function ChooseBusiness(props: { title: string; current?: BusinessOption }) {
  const form = createFormState();
  // Derived: `current` comes from the workspace query, which may still be loading when this mounts.
  const [entityId, setEntityId] = createSignal(() => props.current?.id ?? '');
  const unchanged = () => !!props.current && entityId() === props.current.id;

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!entityId()) {
      form.setMessage({ type: 'error', text: 'Choose your business from the list' });
      return;
    }
    return form.submit(
      async () => {
        await apiSend('/api/workspace/link', 'POST', { entityId: entityId() });
      },
      () => revalidate(getWorkspace.key),
    );
  }

  return (
    <section class="card card-border border-base-300 bg-base-100">
      <form class="card-body gap-4" onSubmit={onSubmit} novalidate>
        <h2 class="card-title">{props.title}</h2>
        <FormMessage message={form.message()} />
        <BusinessCombobox initial={props.current} onSelect={(option) => setEntityId(option.id)} />
        <div class="card-actions justify-end">
          <button type="submit" class="btn btn-primary" disabled={form.pending() || unchanged()}>
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
