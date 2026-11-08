import { revalidate } from '@solidjs/router';
import type { JSX } from '@solidjs/web';
import { createSignal, Show } from 'solid-js';
import type { z } from 'zod';
import { FormMessage } from '~/components/FormMessage';
import { Panel } from '~/components/connect/Page';
import { BrandMark } from '~/components/connect/PublisherLogo';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { getWorkspace } from '~/queries/workspace';

type Props = {
  /** The brand's name, for its logo and the toggle's label. */
  name: string;
  text: string;
  /** The schema's field for the address, and how the input asks for it. */
  field: 'phone' | 'address';
  label: string;
  type: 'tel' | 'email';
  placeholder: string;
  autocomplete: string;
  saved: { address: string; on: boolean; configured: boolean };
  /** Filled in when nothing is saved yet, e.g. the account's email. */
  suggested?: string;
  /** Shown while sending isn't set up on the server. */
  notConfigured: JSX.Element;
  endpoint: string;
  testEndpoint: string;
  schema: z.ZodObject;
  /** Phones are compared and stored without spaces. */
  normalize?: (value: string) => string;
  register: (unsaved: () => boolean) => void;
};

/** A channel that needs one address: an on switch, the address, save, and a test message. */
export function AddressChannel(props: Props) {
  const normalize = (value: string) => (props.normalize ? props.normalize(value) : value.trim());
  const readForm = (el: HTMLFormElement) => {
    const data = new FormData(el);
    return { address: normalize(String(data.get(props.field) ?? '')), on: data.get('on') === 'on' };
  };
  // The header toggle: the settings below only show while it's on.
  const [enabled, setEnabled] = createSignal(() => props.saved.on);
  let input: HTMLInputElement | undefined;
  const form = createFormState();
  const test = createFormState();

  // What the form holds after the owner's last edit; null until they touch it. Saving (or undoing an edit)
  // makes it match what's saved, so the warning clears by itself.
  const [edited, setEdited] = createSignal<ReturnType<typeof readForm> | null>(null);
  const unsaved = () => {
    const values = edited();
    return values !== null && (values.address !== props.saved.address || values.on !== props.saved.on);
  };
  props.register(unsaved);

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const values = readForm(event.currentTarget as HTMLFormElement);
    const payload = form.validate(props.schema, { [props.field]: values.address, on: values.on });
    if (!payload) return;
    return form.submit(
      async () => (await apiSend(props.endpoint, 'PATCH', payload)).message,
      () => revalidate(getWorkspace.key),
    );
  }

  function onToggle(on: boolean) {
    setEnabled(on);
    if (on && !input?.value) queueMicrotask(() => input?.focus());
  }

  const sendTest = () => test.submit(async () => (await apiSend(props.testEndpoint, 'POST', {})).message);
  const inputId = () => `${props.field}-${props.name.toLowerCase()}`;

  return (
    <Panel>
      <form
        class="flex flex-col gap-4"
        onSubmit={onSubmit}
        onInput={(event) => setEdited(readForm(event.currentTarget))}
        novalidate
      >
        <div class="flex items-center gap-3">
          <BrandMark name={props.name} class="size-8" />
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold">{props.name}</h2>
            <p class="text-sm text-base-content/60">{props.text}</p>
          </div>
          <input
            name="on"
            type="checkbox"
            class="toggle"
            aria-label={`Use ${props.name}`}
            checked={enabled()}
            onChange={(e) => onToggle(e.currentTarget.checked)}
          />
        </div>
        <FormMessage message={form.message()} />

        <Show when={!enabled() && props.saved.on}>
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-box border border-base-300 bg-base-200 px-4 py-3 text-sm">
            <span>Save to stop sending suggestions to {props.name}.</span>
            <button type="submit" class="btn btn-sm btn-primary" disabled={form.pending()}>
              <Show when={form.pending()}>
                <span class="loading loading-spinner loading-sm" />
              </Show>
              Save
            </button>
          </div>
        </Show>

        {/* Hidden rather than removed while off, so the form keeps what was typed and still sends it. */}
        <div class="flex flex-col gap-4" hidden={!enabled()}>
          <Show when={!props.saved.configured}>
            <p class="rounded-box border border-base-300 bg-base-200 px-4 py-3 text-sm">
              {props.notConfigured}
            </p>
          </Show>

          <div class="flex flex-col gap-1.5">
            <label for={inputId()} class="font-medium">
              {props.label}
            </label>
            <div class="flex gap-2">
              <input
                ref={(el) => (input = el)}
                id={inputId()}
                name={props.field}
                type={props.type}
                class="input min-w-0 flex-1"
                placeholder={props.placeholder}
                defaultValue={props.saved.address || props.suggested || ''}
                autocomplete={props.autocomplete}
              />
              <button type="submit" class="btn btn-primary" disabled={form.pending()}>
                <Show when={form.pending()}>
                  <span class="loading loading-spinner loading-sm" />
                </Show>
                Save
              </button>
            </div>
            <Show
              when={form.fieldErrors()[props.field]}
              fallback={
                <Show when={unsaved()}>
                  <span class="text-sm text-base-content/60">You have unsaved changes.</span>
                </Show>
              }
            >
              {(error) => <span class="text-error">{error()}</span>}
            </Show>
          </div>

          <Show when={props.saved.configured && props.saved.address}>
            <FormMessage message={test.message()} />
            <div class="flex flex-wrap items-center justify-end gap-2">
              <Show when={unsaved()}>
                <span class="text-sm text-base-content/60">
                  Save first: the test uses your saved settings.
                </span>
              </Show>
              <button
                type="button"
                class="btn btn-ghost border-base-300"
                disabled={test.pending() || unsaved()}
                onClick={sendTest}
              >
                Send test message
              </button>
            </div>
          </Show>
        </div>
      </form>
    </Panel>
  );
}
