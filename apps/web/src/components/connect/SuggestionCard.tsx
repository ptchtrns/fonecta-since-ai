import { revalidate } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';
import { FormMessage } from '~/components/FormMessage';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { formatDay, formatHours } from '~/lib/hours';
import { answerLabels, expectedLookups, impactRest, suggestionHeadline } from '~/lib/suggestion-copy';
import { getWorkspace, type SuggestionItem } from '~/queries/workspace';
import { useCopilot } from '~/components/copilot/CopilotProvider';
import { HoursInput } from './HoursInput';

const importanceStyle = { high: 'badge-neutral', medium: 'badge-outline', low: 'badge-ghost' } as const;

export const sourceNames: Record<string, string> = {
  website: 'Your website',
  facebook: 'Your Facebook page',
  instagram: 'Your Instagram',
  other: 'Your linked page',
};

/** One suggested change: a question, what's at stake for customers, and one tap to answer. The why is folded away. */
export function SuggestionCard(props: { suggestion: SuggestionItem; onAnswered: (message: string) => void }) {
  const s = () => props.suggestion;
  const copilot = useCopilot();
  const form = createFormState();
  const [edit, setEdit] = createSignal<string | null>(null);
  const closure = () => s().kind === 'closure';
  const labels = () => answerLabels(s().suggested);
  const lookups = () => expectedLookups(s().views);
  const disputes = () => s().checks.filter((c) => !c.agrees);
  const confirmations = () => s().checks.filter((c) => c.agrees);

  function respond(action: 'approve' | 'edit' | 'decline') {
    return form.submit(
      async () => {
        const { message } = await apiSend(`/api/suggestions/${s().key}`, 'POST', {
          action,
          hours: action === 'edit' ? edit() : undefined,
        });
        props.onAnswered(message ?? '');
      },
      () => revalidate(getWorkspace.key),
    );
  }

  return (
    <article class="card card-border border-base-300 bg-base-100">
      <div class="card-body gap-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="text-lg font-semibold text-balance">
              {closure() ? s().label : suggestionHeadline(s().label)}
            </h3>
            <Show when={s().date}>
              {(date) => <p class="text-sm text-base-content/60">{formatDay(date())}</p>}
            </Show>
          </div>
          <span class="flex shrink-0 items-center gap-1">
            <Show when={s().sentAt}>
              <span class="badge badge-sm badge-ghost">On WhatsApp</span>
            </Show>
            <span class={['badge badge-sm', importanceStyle[s().importance]]}>
              {s().importance === 'high' ? 'High' : s().importance === 'medium' ? 'Medium' : 'Low'}
            </span>
          </span>
        </div>

        <Show
          when={!closure()}
          fallback={<p class="text-sm">Google still shows you as open. Only you can say for sure.</p>}
        >
          <Show
            when={edit() !== null}
            fallback={
              <dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-0.5 rounded-box bg-base-200 px-4 py-3 tabular-nums">
                <dt class="text-sm text-base-content/60">We suggest</dt>
                <dd class="text-lg font-semibold">{formatHours(s().suggested ?? '')}</dd>
                <dt class="text-sm text-base-content/60">Google shows</dt>
                <dd class="text-sm text-base-content/60">{formatHours(s().shown)}</dd>
              </dl>
            }
          >
            <HoursInput label="Your hours" value={edit()!} onChange={setEdit} />
          </Show>
        </Show>

        <Show when={lookups()}>
          {(people) => (
            <p class="text-sm">
              <strong>{people()}</strong> {impactRest(s().views)}
            </p>
          )}
        </Show>

        <Show when={disputes().length}>
          <div role="alert" class="alert alert-warning alert-soft py-2 text-sm">
            <For each={disputes()}>
              {(check) => (
                <span>
                  {sourceNames[check.kind]} says {formatHours(check.hours)}. Please check before answering.
                </span>
              )}
            </For>
          </div>
        </Show>
        <Show when={confirmations().length}>
          <p class="text-sm text-success">
            ✓{' '}
            {confirmations()
              .map((c) => sourceNames[c.kind])
              .join(', ')}{' '}
            agrees
          </p>
        </Show>

        <FormMessage message={form.message()} />

        <div class="flex flex-wrap items-center gap-2">
          <Show
            when={!closure()}
            fallback={
              <>
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  disabled={form.pending()}
                  onClick={() => respond('decline')}
                >
                  We're still open
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-ghost border-base-300"
                  disabled={form.pending()}
                  onClick={() => respond('approve')}
                >
                  Yes, we've closed
                </button>
              </>
            }
          >
            <Show
              when={edit() !== null}
              fallback={
                <>
                  <button
                    type="button"
                    class="btn btn-sm btn-primary font-semibold"
                    disabled={form.pending()}
                    onClick={() => respond('approve')}
                  >
                    {labels().confirm}
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-ghost border-base-300 font-semibold"
                    disabled={form.pending()}
                    onClick={() => setEdit(s().suggested)}
                  >
                    {labels().edit}
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-ghost"
                    title={labels().dismissHint}
                    disabled={form.pending()}
                    onClick={() => respond('decline')}
                  >
                    {labels().dismiss}
                  </button>
                </>
              }
            >
              <button
                type="button"
                class="btn btn-sm btn-primary font-semibold"
                disabled={form.pending()}
                onClick={() => respond('edit')}
              >
                {labels().save}
              </button>
              <button type="button" class="btn btn-sm btn-ghost" onClick={() => setEdit(null)}>
                Cancel
              </button>
            </Show>
          </Show>
        </div>

        <Show when={s().reasons.length || !closure()}>
          <details class="text-sm text-base-content/70">
            <summary class="cursor-pointer text-xs text-base-content/50 select-none">
              Why we suggest this
            </summary>
            <ul class="mt-2 flex list-disc flex-col gap-0.5 pl-5">
              <For each={s().reasons}>{(reason) => <li>{reason}</li>}</For>
            </ul>
            <Show when={copilot}>
              {(c) => (
                <button
                  type="button"
                  class="btn btn-ghost btn-xs mt-2 px-0 text-base-content/60"
                  onClick={() =>
                    void c().openPanel({
                      selection: { type: 'suggestion', key: s().key },
                      ask: 'Explain this suggestion: why, how sure, and what happens if I answer.',
                    })
                  }
                >
                  Ask Connecta AI about this
                </button>
              )}
            </Show>
            <Show when={!closure()}>
              <p class="mt-2 text-xs text-base-content/50">
                {Math.round((s().confidence ?? 0) * 100)}% sure · {s().views} Google views on a day like this
                last year
              </p>
            </Show>
          </details>
        </Show>
      </div>
    </article>
  );
}
