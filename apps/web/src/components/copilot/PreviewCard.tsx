import { For, Show } from 'solid-js';
import type { PreviewView } from '~/lib/copilot/types';
import { useCopilot } from './CopilotProvider';

const statusLabels: Record<PreviewView['status'], { text: string; class: string }> = {
  pending: { text: 'Waiting for you', class: 'badge-warning' },
  confirmed: { text: 'Saving…', class: 'badge-info' },
  committed: { text: 'Confirmed', class: 'badge-success' },
  failed: { text: 'Failed', class: 'badge-error' },
  cancelled: { text: 'Cancelled', class: 'badge-ghost' },
  expired: { text: 'Expired', class: 'badge-ghost' },
  stale: { text: 'Out of date', class: 'badge-ghost' },
};

/** A change the copilot prepared: what changes, what else happens, and the owner's Confirm or Cancel. */
export function PreviewCard(props: { preview: PreviewView }) {
  const copilot = useCopilot()!;
  const p = () => props.preview;
  const working = () => copilot.state.working.includes(p().id);
  const notice = () => copilot.state.notices[p().id];
  const open = () => p().status === 'pending';
  // What happened: this session's answer from the server, or the outcome recorded with the preview.
  const outcome = () =>
    notice() ??
    (p().resultMessage
      ? {
          type: p().status === 'committed' ? ('success' as const) : ('error' as const),
          text: p().resultMessage!,
        }
      : null);

  return (
    <article
      class={['rounded-box border bg-base-100 p-3 text-sm', open() ? 'border-warning' : 'border-base-300']}
      aria-label={`Preview: ${p().title}`}
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <h3 class="font-semibold">{p().title}</h3>
        <span class={['badge badge-sm', statusLabels[p().status].class]}>
          {statusLabels[p().status].text}
        </span>
      </div>

      <table class="table table-xs">
        <thead>
          <tr>
            <th class="w-1/4" />
            <th>Now</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          <For each={p().diff}>
            {(row) => (
              <tr class="align-top">
                <th class="font-medium">{row.label}</th>
                <td class="break-words text-base-content/60 line-through decoration-base-content/30">
                  {row.before}
                </td>
                <td class="break-words font-medium">{row.after}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>

      <Show when={p().effects.length}>
        <ul class="mt-2 list-disc space-y-0.5 pl-5 text-xs text-base-content/70">
          <For each={p().effects}>{(effect) => <li>{effect}</li>}</For>
        </ul>
      </Show>

      <Show when={outcome()}>
        {(n) => (
          <p role="status" class={['mt-2 text-xs', n().type === 'error' ? 'text-error' : 'text-success']}>
            {n().text}
          </p>
        )}
      </Show>

      <Show when={open()}>
        <div class="mt-3 flex items-center gap-2">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            disabled={working()}
            onClick={() => void copilot.confirm(p())}
          >
            <Show when={working()}>
              <span class="loading loading-spinner loading-xs" />
            </Show>
            Confirm
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            disabled={working()}
            onClick={() => void copilot.cancel(p())}
          >
            Cancel
          </button>
          <span class="ml-auto text-xs text-base-content/50">Nothing changes until you confirm.</span>
        </div>
      </Show>
    </article>
  );
}
