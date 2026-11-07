import { revalidate } from '@solidjs/router';
import { createSignal, For, Show } from 'solid-js';
import { FormMessage } from '~/components/FormMessage';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { formatDay, formatHours } from '~/lib/hours';
import { getWorkspace, type SuggestionItem } from '~/queries/workspace';
import { HoursInput } from './HoursInput';

const importanceStyle = { high: 'badge-neutral', medium: 'badge-outline', low: 'badge-ghost' } as const;

export const sourceNames: Record<string, string> = {
  website: 'Your website',
  facebook: 'Your Facebook page',
  instagram: 'Your Instagram',
  other: 'Your linked page',
};

/** One suggested change: the day, the change, why, and one tap to answer. */
export function SuggestionCard(props: { suggestion: SuggestionItem; onAnswered: (message: string) => void }) {
  const s = () => props.suggestion;
  const form = createFormState();
  const [edit, setEdit] = createSignal<string | null>(null);
  const closure = () => s().kind === 'closure';
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
            <h3 class="font-semibold text-balance">
              <Show when={s().date} fallback={s().label}>
                {(date) => (
                  <>
                    {formatDay(date())}
                    <span class="font-normal text-base-content/60"> · {s().label}</span>
                  </>
                )}
              </Show>
            </h3>
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
              <p class="flex flex-wrap items-baseline gap-x-2 tabular-nums">
                <span class="text-sm text-base-content/50 line-through">{formatHours(s().shown)}</span>
                <span class="text-lg font-semibold">{formatHours(s().suggested ?? '')}</span>
              </p>
            }
          >
            <HoursInput label="Your hours" value={edit()!} onChange={setEdit} />
          </Show>
        </Show>

        <ul class="flex flex-col gap-0.5 text-sm text-base-content/70">
          <For each={s().reasons}>{(reason) => <li>{reason}</li>}</For>
        </ul>

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

        <Show when={!closure()}>
          <p class="text-xs text-base-content/50">
            {Math.round((s().confidence ?? 0) * 100)}% sure · about {s().views} Google views on a day like
            this
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
                    class="btn btn-sm btn-primary"
                    disabled={form.pending()}
                    onClick={() => respond('approve')}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-ghost border-base-300"
                    disabled={form.pending()}
                    onClick={() => setEdit(s().suggested)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm btn-ghost"
                    disabled={form.pending()}
                    onClick={() => respond('decline')}
                  >
                    No thanks
                  </button>
                </>
              }
            >
              <button
                type="button"
                class="btn btn-sm btn-primary"
                disabled={form.pending()}
                onClick={() => respond('edit')}
              >
                Approve my hours
              </button>
              <button type="button" class="btn btn-sm btn-ghost" onClick={() => setEdit(null)}>
                Cancel
              </button>
            </Show>
          </Show>
        </div>
      </div>
    </article>
  );
}
