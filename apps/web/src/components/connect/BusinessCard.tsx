import { revalidate } from '@solidjs/router';
import { createSignal, flush, For, Show } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { FormField } from '~/components/FormField';
import { FormMessage } from '~/components/FormMessage';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { formatDay, formatHours, groupWeek, WEEKDAYS, WEEKDAY_SHORT, type Weekday } from '~/lib/hours';
import { getWorkspace, type Workspace } from '~/queries/workspace';
import { businessEditSchema } from '~/schemas/business.schema';
import { HoursInput } from './HoursInput';

const EXCEPTIONS_SHOWN = 4;

function Row(props: { label: string; children: JSX.Element }) {
  return (
    <div class="flex flex-col gap-0.5">
      <dt class="text-xs text-base-content/50">{props.label}</dt>
      <dd class="min-w-0 break-words">{props.children}</dd>
    </div>
  );
}

/** The one place for business information: everything customers see, and one form to change it. */
export function BusinessCard(props: { business: Workspace['business'] }) {
  const b = () => props.business;
  const form = createFormState();
  const [hours, setHours] = createSignal<Record<Weekday, string>>(() => b().hours);
  const [saved, setSaved] = createSignal('');
  // The form is only mounted while the dialog is open, so a cancelled edit doesn't come back the next time.
  const [editing, setEditing] = createSignal(false);
  let dialog!: HTMLDialogElement;

  function openEditor() {
    setHours(b().hours);
    setSaved('');
    form.setMessage(null);
    setEditing(true);
    flush();
    dialog.showModal();
  }

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const input = {
      ...Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement)),
      hours: hours(),
    };
    const payload = form.validate(businessEditSchema, input);
    if (!payload) return;
    return form.submit(
      async () => {
        const { message } = await apiSend('/api/workspace/business', 'PATCH', payload);
        setSaved(message ?? '');
        dialog.close();
      },
      () => revalidate(getWorkspace.key),
    );
  }

  return (
    <section class="card card-border border-base-300 bg-base-100">
      <div class="card-body gap-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h1 class="text-xl font-semibold tracking-tight text-balance">{b().name}</h1>
            <p class="text-sm text-base-content/60">{b().category}</p>
          </div>
          <button type="button" class="btn btn-sm btn-ghost border-base-300" onClick={openEditor}>
            Edit
          </button>
        </div>

        <Show when={saved()}>
          <p role="status" class="text-sm text-success">
            {saved()}
          </p>
        </Show>

        <dl class="flex flex-col gap-3 text-sm">
          <Row label="Address">
            {b().addressLine1}, {b().postalCode} {b().city}
          </Row>
          <Row label="Phone">{b().phone || '—'}</Row>
          <Row label="Website">
            <Show when={b().website} fallback="—">
              <a href={b().website} target="_blank" rel="noreferrer" class="link link-hover">
                {b().website.replace(/^https?:\/\//, '')}
              </a>
            </Show>
          </Row>
          <Show when={b().description}>
            <Row label="Description">{b().description}</Row>
          </Show>
          <Row label="Opening hours">
            <div class="flex flex-col gap-0.5">
              <For each={groupWeek(b().hours)}>
                {(group) => (
                  <div class="flex justify-between gap-4">
                    <span>{group.days}</span>
                    <span class="text-right tabular-nums">{formatHours(group.hours)}</span>
                  </div>
                )}
              </For>
            </div>
          </Row>
          <Show when={b().exceptions.length}>
            <Row label="Coming exceptions">
              <div class="flex flex-col gap-0.5">
                <For each={b().exceptions.slice(0, EXCEPTIONS_SHOWN)}>
                  {(day) => (
                    <div class="flex justify-between gap-4" title={day.label}>
                      <span>{formatDay(day.date)}</span>
                      <span class="text-right tabular-nums">{formatHours(day.hours)}</span>
                    </div>
                  )}
                </For>
                <Show when={b().exceptions.length > EXCEPTIONS_SHOWN}>
                  <span class="text-xs text-base-content/50">
                    and {b().exceptions.length - EXCEPTIONS_SHOWN} more
                  </span>
                </Show>
              </div>
            </Row>
          </Show>
        </dl>
      </div>

      <dialog
        ref={(el) => (dialog = el)}
        class="modal"
        aria-labelledby="edit-business-title"
        onClose={() => setEditing(false)}
      >
        <div class="modal-box max-w-xl">
          <Show when={editing()}>
            <form class="flex flex-col gap-4" onSubmit={onSubmit} novalidate>
              <h2 id="edit-business-title" class="text-lg font-semibold">
                Edit business information
              </h2>
              <FormMessage message={form.message()} />
              <FormField label="Name" error={form.fieldErrors().name}>
                <input name="name" class="input w-full" defaultValue={b().name} />
              </FormField>
              <div class="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <FormField label="Street address" error={form.fieldErrors().addressLine1}>
                  <input name="addressLine1" class="input w-full" defaultValue={b().addressLine1} />
                </FormField>
                <FormField label="Postal code" error={form.fieldErrors().postalCode}>
                  <input name="postalCode" class="input w-full" defaultValue={b().postalCode} />
                </FormField>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <FormField label="Phone" error={form.fieldErrors().phone}>
                  <input name="phone" type="tel" class="input w-full" defaultValue={b().phone} />
                </FormField>
                <FormField label="Website" error={form.fieldErrors().website}>
                  <input name="website" class="input w-full" defaultValue={b().website} />
                </FormField>
              </div>
              <FormField label="Description" error={form.fieldErrors().description}>
                <textarea name="description" class="textarea h-20 w-full" defaultValue={b().description} />
              </FormField>
              <fieldset class="flex flex-col gap-2">
                <legend class="mb-1.5 font-medium">Opening hours</legend>
                <For each={WEEKDAYS}>
                  {(day) => (
                    <HoursInput
                      label={WEEKDAY_SHORT[day]}
                      value={hours()[day]}
                      onChange={(next) => setHours({ ...hours(), [day]: next })}
                    />
                  )}
                </For>
                <Show when={form.fieldErrors().hours}>
                  <span class="text-error">{form.fieldErrors().hours}</span>
                </Show>
              </fieldset>
              <div class="modal-action">
                <button type="button" class="btn btn-ghost" onClick={() => dialog.close()}>
                  Cancel
                </button>
                <button type="submit" class="btn btn-primary" disabled={form.pending()}>
                  <Show when={form.pending()}>
                    <span class="loading loading-spinner loading-sm" />
                  </Show>
                  Save
                </button>
              </div>
            </form>
          </Show>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button aria-label="Close">close</button>
        </form>
      </dialog>
    </section>
  );
}
