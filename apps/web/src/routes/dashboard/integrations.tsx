import { Title } from '@solidjs/meta';
import { revalidate, type RouteDefinition } from '@solidjs/router';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { FormField } from '~/components/FormField';
import { FormMessage } from '~/components/FormMessage';
import { Page, PageHeader, Panel } from '~/components/connect/Page';
import { BrandMark } from '~/components/connect/PublisherLogo';
import { WhatsAppPreview } from '~/components/connect/WhatsAppPreview';
import type { Language } from '~/db/schema';
import { meetsImportance, type Importance } from '~/lib/importance';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { getWorkspace, type Workspace } from '~/queries/workspace';
import { whatsappSchema } from '~/schemas/business.schema';

export const route = {
  preload: () => void getWorkspace(),
} satisfies RouteDefinition;

const languageNames: Record<Language, string> = { fi: 'Suomi', sv: 'Svenska', nb: 'Norsk', en: 'English' };

const levels: { value: Importance; title: string; text: string }[] = [
  {
    value: 'high',
    title: 'High only',
    text: 'The most pressing: likely right, on a day many people look you up, often within the next week.',
  },
  {
    value: 'medium',
    title: 'Medium and up',
    text: 'Also changes worth a look that matter less: a less certain guess or a quieter day.',
  },
  {
    value: 'low',
    title: 'Everything',
    text: 'Low ones too: unsure guesses, days few people look you up, days far ahead.',
  },
];

export default function Integrations() {
  const workspace = createMemo(() => getWorkspace() as Promise<Workspace>);
  const whatsapp = () => workspace().whatsapp;
  // The owner's pick before saving; until then, what's saved.
  const [picked, setPicked] = createSignal<Importance | null>(null);
  const level = () => picked() ?? whatsapp().minImportance;
  // What WhatsApp could carry: hours changes no linked page disputes. The rest always wait on the dashboard.
  const waiting = () =>
    workspace().suggestions.pending.filter((p) => p.kind === 'hours' && p.checks.every((c) => c.agrees));
  const sentAt = (min: Importance) => waiting().filter((p) => meetsImportance(p.importance, min)).length;
  const form = createFormState();
  const test = createFormState();

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const payload = form.validate(whatsappSchema, {
      phone: String(data.get('phone') ?? ''),
      language: data.get('language'),
      on: data.get('on') === 'on',
      minImportance: data.get('minImportance'),
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

          <div class="flex flex-col gap-1.5">
            <label for="whatsapp-phone" class="font-medium">
              WhatsApp number
            </label>
            <div class="flex gap-2">
              <input
                id="whatsapp-phone"
                name="phone"
                type="tel"
                class="input min-w-0 flex-1"
                placeholder="+358 40 123 4567"
                defaultValue={whatsapp().phone}
                autocomplete="tel"
              />
              <button type="submit" class="btn btn-primary" disabled={form.pending()}>
                <Show when={form.pending()}>
                  <span class="loading loading-spinner loading-sm" />
                </Show>
                Save
              </button>
            </div>
            <Show when={form.fieldErrors().phone}>
              {(error) => <span class="text-error">{error()}</span>}
            </Show>
          </div>

          <details class="collapse-arrow collapse rounded-box border border-base-300">
            <summary class="collapse-title min-h-0 py-3 text-sm font-medium">More options</summary>
            <div class="collapse-content flex flex-col gap-4">
              <FormField label="Message language">
                <select name="language" class="select w-full sm:w-1/2">
                  <For each={Object.keys(languageNames) as Language[]}>
                    {(language) => (
                      <option value={language} selected={whatsapp().language === language}>
                        {languageNames[language]}
                      </option>
                    )}
                  </For>
                </select>
              </FormField>

              <label class="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 p-3">
                <input name="on" type="checkbox" class="toggle mt-0.5" checked={whatsapp().on} />
                <span>
                  <span class="block font-medium">Send me suggestions on WhatsApp</span>
                  <span class="text-sm text-base-content/60">
                    One at a time, the most important first. The next comes after you've answered.
                  </span>
                </span>
              </label>
              <fieldset class="flex flex-col gap-2">
                <legend class="font-medium">Which suggestions to send</legend>
                <p class="text-sm text-base-content/60">
                  Every suggestion has a level. The rest wait for you on the dashboard.
                </p>
                <div class="grid gap-2 sm:grid-cols-3">
                  <For each={levels}>
                    {(option) => (
                      <label
                        class={[
                          'flex cursor-pointer flex-col gap-1 rounded-box border p-3',
                          level() === option.value ? 'border-base-content' : 'border-base-300',
                        ]}
                      >
                        <span class="flex items-center gap-2">
                          <input
                            type="radio"
                            name="minImportance"
                            value={option.value}
                            class="radio radio-sm"
                            checked={level() === option.value}
                            onChange={() => setPicked(option.value)}
                          />
                          <span class="font-medium">{option.title}</span>
                        </span>
                        <span class="text-sm text-base-content/60">{option.text}</span>
                        <span class="mt-auto pt-1 text-xs text-base-content/50">
                          {sentAt(option.value)} of {waiting().length} waiting now
                        </span>
                      </label>
                    )}
                  </For>
                </div>
                <details class="text-sm text-base-content/70">
                  <summary class="cursor-pointer text-xs text-base-content/50 select-none">
                    How levels work
                  </summary>
                  <div class="mt-2 flex flex-col gap-2">
                    <p>
                      A suggestion matters more the likelier it is to be right, the more people look you up on
                      Google that day, and the sooner the day is. Days within a week count double, within a
                      month a quarter more.
                    </p>
                    <p>
                      Levels compare your suggestions with each other. Your most pressing upcoming day is
                      High, and so is anything at least two thirds as pressing. Medium is at least a third,
                      Low is the rest. So a suggestion can move up as its day gets close.
                    </p>
                    <p>
                      Days a page you linked disagrees with, and the question whether you've closed for good,
                      are never sent: they wait on the dashboard.
                    </p>
                  </div>
                </details>
              </fieldset>

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
                    We update them when we're at least 70% sure and no linked page disagrees, then tell you
                    what changed.
                  </span>
                </span>
              </label>

              <Show when={whatsapp().preview}>
                {(preview) => (
                  <div class="flex flex-col gap-2">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <h3 class="font-medium">Your next message</h3>
                      <a
                        href={preview().url}
                        target="_blank"
                        rel="noreferrer"
                        class="btn btn-ghost btn-sm border-base-300"
                      >
                        Open the answer page
                      </a>
                    </div>
                    <WhatsAppPreview body={preview().body} buttons={preview().buttons} />
                  </div>
                )}
              </Show>

              <Show when={whatsapp().configured && whatsapp().phone}>
                <FormMessage message={test.message()} />
                <div class="flex justify-end">
                  <button type="button" class="btn btn-ghost" disabled={test.pending()} onClick={sendTest}>
                    Send test message
                  </button>
                </div>
              </Show>
            </div>
          </details>
        </form>
      </Panel>
    </Page>
  );
}
