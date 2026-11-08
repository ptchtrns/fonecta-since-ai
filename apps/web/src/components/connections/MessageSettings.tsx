import { revalidate } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';
import { FormField } from '~/components/FormField';
import { FormMessage } from '~/components/FormMessage';
import { WhatsAppPreview } from '~/components/connect/WhatsAppPreview';
import type { Language } from '~/db/schema';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { meetsImportance, type Importance } from '~/lib/importance';
import { getWorkspace, type Workspace } from '~/queries/workspace';
import { messageSettingsSchema } from '~/schemas/business.schema';

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

function readForm(el: HTMLFormElement) {
  const data = new FormData(el);
  return {
    language: data.get('language'),
    minImportance: data.get('minImportance'),
    standingPermission: data.get('standingPermission') === 'on',
  };
}
type FormValues = ReturnType<typeof readForm>;

/**
 * What we send: language, which suggestions go out, and standing permission, the same on every channel. Shown in
 * "How we reach you", under additional options.
 */
export function MessageSettings(props: { workspace: Workspace; register: (unsaved: () => boolean) => void }) {
  const settings = () => props.workspace.messages;
  // The owner's pick before saving; until then, what's saved.
  const [picked, setPicked] = createSignal<Importance | null>(null);
  const level = () => picked() ?? settings().minImportance;
  // What a channel could carry: hours changes no linked page disputes. The rest always wait on the dashboard.
  const waiting = () =>
    props.workspace.suggestions.pending.filter((p) => p.kind === 'hours' && p.checks.every((c) => c.agrees));
  const sentAt = (min: Importance) => waiting().filter((p) => meetsImportance(p.importance, min)).length;
  const form = createFormState();

  const [edited, setEdited] = createSignal<FormValues | null>(null);
  const changed = (key: keyof FormValues) => {
    const values = edited();
    return values !== null && values[key] !== settings()[key];
  };
  const unsaved = () => changed('language') || changed('minImportance') || changed('standingPermission');
  props.register(unsaved);
  // The preview follows the language being picked; which suggestion it is still follows the saved level.
  const previewLanguage = () => (edited()?.language as Language | undefined) ?? settings().language;

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const payload = form.validate(messageSettingsSchema, readForm(event.currentTarget as HTMLFormElement));
    if (!payload) return;
    return form.submit(
      async () => (await apiSend('/api/workspace/messages', 'PATCH', payload)).message,
      () => revalidate(getWorkspace.key),
    );
  }

  return (
    <form
      class="flex flex-col gap-4"
      onSubmit={onSubmit}
      onInput={(event) => setEdited(readForm(event.currentTarget))}
      novalidate
    >
      <div>
        <h3 class="font-medium">What we send</h3>
        <p class="text-sm text-base-content/60">The same on every channel.</p>
      </div>

      <FormMessage message={form.message()} />

      <FormField label="Message language">
        <select name="language" class="select w-full sm:w-1/2">
          <For each={Object.keys(languageNames) as Language[]}>
            {(language) => (
              <option value={language} selected={settings().language === language}>
                {languageNames[language]}
              </option>
            )}
          </For>
        </select>
      </FormField>

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
          <summary class="cursor-pointer text-xs text-base-content/50 select-none">How levels work</summary>
          <div class="mt-2 flex flex-col gap-2">
            <p>
              A suggestion matters more the likelier it is to be right, the more people look you up on Google
              that day, and the sooner the day is. Days within a week count double, within a month a quarter
              more.
            </p>
            <p>
              Levels compare your suggestions with each other. Your most pressing upcoming day is High, and so
              is anything at least two thirds as pressing. Medium is at least a third, Low is the rest. So a
              suggestion can move up as its day gets close.
            </p>
            <p>
              Days a page you linked disagrees with, and the question whether you've closed for good, are
              never sent: they wait on the dashboard.
            </p>
          </div>
        </details>
      </fieldset>

      <label class="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 p-3">
        <input
          name="standingPermission"
          type="checkbox"
          class="toggle mt-0.5"
          checked={settings().standingPermission}
        />
        <span>
          <span class="block font-medium">Handle public holidays without asking</span>
          <span class="text-sm text-base-content/60">
            We update them when we're at least 70% sure and no linked page disagrees, then tell you what
            changed.
          </span>
        </span>
      </label>

      <div class="flex flex-wrap items-center justify-end gap-3">
        <Show when={unsaved()}>
          <span class="text-sm text-base-content/60">You have unsaved changes.</span>
        </Show>
        <button type="submit" class="btn btn-primary" disabled={form.pending()}>
          <Show when={form.pending()}>
            <span class="loading loading-spinner loading-sm" />
          </Show>
          Save
        </button>
      </div>

      <Show when={settings().preview}>
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
            <Show when={changed('minImportance')}>
              <p class="text-sm text-base-content/60">
                This is the next message at your saved level. Save to see it at the new one.
              </p>
            </Show>
            <WhatsAppPreview
              body={preview().messages[previewLanguage()].body}
              buttons={preview().messages[previewLanguage()].buttons}
            />
          </div>
        )}
      </Show>
    </form>
  );
}
