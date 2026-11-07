import { Title } from '@solidjs/meta';
import { revalidate, type RouteDefinition } from '@solidjs/router';
import { createMemo, For, Show } from 'solid-js';
import { FormField } from '~/components/FormField';
import { FormMessage } from '~/components/FormMessage';
import { Page, PageHeader, Panel } from '~/components/connect/Page';
import { BrandMark } from '~/components/connect/PublisherLogo';
import { WhatsAppPreview } from '~/components/connect/WhatsAppPreview';
import type { Language } from '~/db/schema';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { getWorkspace, type Workspace } from '~/queries/workspace';
import { whatsappSchema } from '~/schemas/business.schema';

export const route = {
  preload: () => void getWorkspace(),
} satisfies RouteDefinition;

const languageNames: Record<Language, string> = { fi: 'Suomi', sv: 'Svenska', nb: 'Norsk', en: 'English' };

export default function Integrations() {
  const workspace = createMemo(() => getWorkspace() as Promise<Workspace>);
  const whatsapp = () => workspace().whatsapp;
  const form = createFormState();
  const test = createFormState();

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const payload = form.validate(whatsappSchema, {
      phone: String(data.get('phone') ?? ''),
      language: data.get('language'),
      on: data.get('on') === 'on',
      standingPermission: data.get('standingPermission') === 'on',
    });
    if (!payload) return;
    return form.submit(
      async () => (await apiSend('/api/workspace/whatsapp', 'PATCH', payload)).message,
      () => revalidate(getWorkspace.key),
    );
  }

  function sendTest() {
    return test.submit(async () => (await apiSend('/api/workspace/whatsapp/test', 'POST', {})).message);
  }

  return (
    <Page class="max-w-3xl">
      <Title>Integrations · Connecta AI</Title>
      <PageHeader title="Integrations" />

      <Panel>
        <form class="flex flex-col gap-4" onSubmit={onSubmit} novalidate>
          <div class="flex items-center gap-3">
            <BrandMark name="WhatsApp" class="size-8" />
            <div class="min-w-0 flex-1">
              <h2 class="font-semibold">WhatsApp</h2>
              <p class="text-sm text-base-content/60">Answer suggestions with one tap, without logging in.</p>
            </div>
            <span class={['badge badge-sm', whatsapp().on ? 'badge-neutral' : 'badge-ghost']}>
              {whatsapp().on ? 'On' : 'Off'}
            </span>
          </div>

          <Show when={!whatsapp().configured}>
            <p class="rounded-box border border-base-300 bg-base-200 px-4 py-3 text-sm">
              Sending isn't connected on this server yet. Your settings are saved, and messages start once it
              is.
            </p>
          </Show>
          <FormMessage message={form.message()} />

          <div class="grid gap-4 sm:grid-cols-2">
            <FormField label="WhatsApp number" error={form.fieldErrors().phone}>
              <input
                name="phone"
                type="tel"
                class="input w-full"
                placeholder="+358 40 123 4567"
                defaultValue={whatsapp().phone}
                autocomplete="tel"
              />
            </FormField>
            <FormField label="Message language">
              <select name="language" class="select w-full">
                <For each={Object.keys(languageNames) as Language[]}>
                  {(language) => (
                    <option value={language} selected={whatsapp().language === language}>
                      {languageNames[language]}
                    </option>
                  )}
                </For>
              </select>
            </FormField>
          </div>

          <label class="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 p-3">
            <input name="on" type="checkbox" class="toggle mt-0.5" checked={whatsapp().on} />
            <span>
              <span class="block font-medium">Send me suggestions on WhatsApp</span>
              <span class="text-sm text-base-content/60">
                One at a time, the most important first. The next comes after you've answered.
              </span>
            </span>
          </label>
          <label class="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 p-3">
            <input
              name="standingPermission"
              type="checkbox"
              class="toggle mt-0.5"
              checked={whatsapp().standingPermission}
            />
            <span>
              <span class="block font-medium">Handle public holidays without asking</span>
              <span class="text-sm text-base-content/60">
                We update them when we're at least 70% sure and no linked page disagrees, then tell you what
                changed.
              </span>
            </span>
          </label>

          <FormMessage message={test.message()} />
          <div class="flex flex-wrap justify-end gap-2">
            <Show when={whatsapp().configured && whatsapp().phone}>
              <button type="button" class="btn btn-ghost" disabled={test.pending()} onClick={sendTest}>
                Send test message
              </button>
            </Show>
            <button type="submit" class="btn btn-primary" disabled={form.pending()}>
              <Show when={form.pending()}>
                <span class="loading loading-spinner loading-sm" />
              </Show>
              Save
            </button>
          </div>
        </form>
      </Panel>

      <Show when={whatsapp().preview}>
        {(preview) => (
          <Panel
            title="Your next message"
            action={
              <a
                href={preview().url}
                target="_blank"
                rel="noreferrer"
                class="btn btn-ghost btn-sm border-base-300"
              >
                Open the answer page
              </a>
            }
          >
            <WhatsAppPreview body={preview().body} buttons={preview().buttons} />
          </Panel>
        )}
      </Show>
    </Page>
  );
}
