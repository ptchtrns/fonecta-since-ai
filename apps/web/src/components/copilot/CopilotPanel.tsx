import { createEffect, createSignal, For, Show } from 'solid-js';
import { MAX_COPILOT_MESSAGE } from '~/schemas/copilot.schema';
import type { CopilotSelection, MessageView } from '~/lib/copilot/types';
import { ChatIcon, CheckIcon, SendIcon, XIcon } from '~/components/connect/icons';
import { useCopilot } from './CopilotProvider';
import { PreviewCard } from './PreviewCard';

const selectionLabel = (sel: NonNullable<CopilotSelection>) =>
  sel.type === 'suggestion' ? `suggestion ${sel.key}` : 'a suggested edit';

const STARTERS = [
  'What should I fix first to be found more?',
  'Explain my most important suggestion',
  'Is my listing live everywhere?',
  'Make my description better for local search',
];

/** The dashboard's copilot: a button in the corner and a side panel with the conversation. */
export function CopilotPanel() {
  const copilot = useCopilot()!;
  const s = copilot.state;
  const [text, setText] = createSignal('');
  let list: HTMLOListElement | undefined;
  let input: HTMLTextAreaElement | undefined;

  const messages = () => s.conversation?.messages ?? [];
  const sending = () => s.outgoing !== null;

  // Keep the newest message in view.
  createEffect(
    () => [messages().length, s.outgoing, s.error] as const,
    () => {
      if (list) list.scrollTop = list.scrollHeight;
    },
  );
  createEffect(
    () => s.open,
    (open) => {
      if (open) queueMicrotask(() => input?.focus());
    },
  );

  function submit(event?: Event) {
    event?.preventDefault();
    const value = text().trim();
    if (!value || sending()) return;
    setText('');
    void copilot.send(value);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) submit(event);
    if (event.key === 'Escape') copilot.close();
  }

  return (
    <>
      <Show when={!s.open}>
        <button
          type="button"
          class="btn btn-primary fixed right-4 bottom-4 z-30 gap-2 rounded-full shadow-lg"
          onClick={() => void copilot.openPanel()}
        >
          <ChatIcon class="size-4" />
          Ask Connecta AI
        </button>
      </Show>

      <Show when={s.open}>
        <aside
          role="dialog"
          aria-label="Connecta AI copilot"
          class="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-base-300 bg-base-100 shadow-2xl sm:w-[28rem]"
          onKeyDown={(e) => e.key === 'Escape' && copilot.close()}
        >
          <header class="flex items-center gap-2 border-b border-base-300 px-4 py-3">
            <ChatIcon class="size-5" />
            <div class="min-w-0 flex-1">
              <h2 class="font-semibold">Connecta AI</h2>
              <p class="truncate text-xs text-base-content/60">
                Answers from your dashboard. Changes only when you confirm.
              </p>
            </div>
            <Show when={s.conversation}>
              <div class="dropdown dropdown-end">
                <button type="button" tabindex="0" class="btn btn-ghost btn-sm">
                  ⋯
                </button>
                <ul
                  tabindex="0"
                  class="menu dropdown-content z-50 w-52 rounded-box border border-base-300 bg-base-100 p-2 shadow"
                >
                  <li>
                    <button type="button" onClick={copilot.startOver}>
                      New conversation
                    </button>
                  </li>
                  <li>
                    <button type="button" class="text-error" onClick={() => void copilot.remove()}>
                      Delete this conversation
                    </button>
                  </li>
                </ul>
              </div>
            </Show>
            <button
              type="button"
              class="btn btn-square btn-ghost btn-sm"
              aria-label="Close"
              onClick={copilot.close}
            >
              <XIcon />
            </button>
          </header>

          <ol
            ref={(el) => (list = el)}
            class="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
            aria-live="polite"
          >
            <Show when={!s.enabled}>
              <li role="alert" class="alert alert-warning alert-soft text-sm">
                No language model is connected, so the copilot can't answer. The questions on the front page
                still work.
              </li>
            </Show>
            <Show when={s.loaded && s.enabled && !messages().length && !sending()}>
              <li class="flex flex-col gap-2">
                <p class="text-sm text-base-content/70">
                  Ask about your scores, suggestions, listings or settings, or ask for a change. You'll see
                  exactly what would change before anything is saved.
                </p>
                <div class="flex flex-wrap gap-2">
                  <For each={STARTERS}>
                    {(q) => (
                      <button
                        type="button"
                        class="btn btn-xs rounded-full border-base-300 bg-base-100 font-normal"
                        onClick={() => void copilot.send(q)}
                      >
                        {q}
                      </button>
                    )}
                  </For>
                </div>
              </li>
            </Show>
            <Show when={!s.loaded}>
              <li class="loading loading-dots loading-sm self-center" aria-label="Loading" />
            </Show>

            <For each={messages()}>{(m) => <MessageItem message={m} />}</For>

            <Show when={s.outgoing}>
              {(q) => (
                <>
                  <li class="chat chat-end">
                    <div class="chat-bubble chat-bubble-primary text-sm whitespace-pre-wrap">{q()}</div>
                  </li>
                  <li class="chat chat-start">
                    <div class="chat-bubble bg-base-200 text-base-content">
                      <span class="loading loading-dots loading-sm" aria-label="Thinking" />
                    </div>
                  </li>
                </>
              )}
            </Show>

            <Show when={s.error}>
              {(error) => (
                <li role="alert" class="alert alert-error alert-soft py-2 text-sm">
                  <span>{error()}</span>
                  <Show when={s.failed}>
                    <button type="button" class="btn btn-xs" onClick={() => void copilot.retry()}>
                      Try again
                    </button>
                  </Show>
                </li>
              )}
            </Show>
          </ol>

          <form class="border-t border-base-300 p-3" onSubmit={submit}>
            <Show when={s.selection}>
              {(sel) => (
                <div class="mb-2 flex items-center gap-2 text-xs text-base-content/70">
                  <span class="badge badge-sm badge-ghost">About: {selectionLabel(sel())}</span>
                  <button type="button" class="link" onClick={copilot.clearSelection}>
                    clear
                  </button>
                </div>
              )}
            </Show>
            <div class="flex items-end gap-2 rounded-box border border-base-300 p-2 focus-within:border-base-content/40">
              <textarea
                ref={(el) => (input = el)}
                class="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-base-content/40"
                rows={2}
                maxlength={MAX_COPILOT_MESSAGE}
                aria-label="Message Connecta AI"
                placeholder="Ask, or ask for a change…"
                disabled={!s.enabled}
                value={text()}
                onInput={(e) => setText(e.currentTarget.value)}
                onKeyDown={onKeyDown}
              />
              <Show
                when={sending()}
                fallback={
                  <button
                    type="submit"
                    class="btn btn-square btn-primary btn-sm"
                    aria-label="Send"
                    disabled={!text().trim() || !s.enabled}
                  >
                    <SendIcon class="size-4" />
                  </button>
                }
              >
                <button type="button" class="btn btn-sm" onClick={() => void copilot.stop()}>
                  Stop
                </button>
              </Show>
            </div>
          </form>
        </aside>
      </Show>
    </>
  );
}

function MessageItem(props: { message: MessageView }) {
  const m = () => props.message;
  return (
    <Show
      when={m().role !== 'event'}
      fallback={
        <li class="flex items-start gap-2 self-center rounded-box bg-success/10 px-3 py-2 text-xs text-success">
          <CheckIcon class="mt-0.5 size-3.5 shrink-0" />
          <span>{m().content}</span>
        </li>
      }
    >
      <li class={['chat', m().role === 'user' ? 'chat-end' : 'chat-start']}>
        <div
          class={[
            'chat-bubble text-sm whitespace-pre-wrap',
            m().role === 'user' ? 'chat-bubble-primary' : 'bg-base-200 text-base-content',
            m().status === 'failed' && 'text-error',
            m().status === 'cancelled' && 'italic opacity-60',
          ]}
        >
          <Show when={m().status !== 'pending'} fallback={<span class="loading loading-dots loading-sm" />}>
            {m().content}
          </Show>
        </div>
        <Show when={m().role === 'assistant' && m().model}>
          <div class="chat-footer text-[0.65rem] text-base-content/40">
            {(m().model ?? '').split('/').pop()}
          </div>
        </Show>
      </li>
      <Show when={m().previews.length}>
        <li class="flex flex-col gap-2">
          <For each={m().previews}>{(p) => <PreviewCard preview={p} />}</For>
        </li>
      </Show>
    </Show>
  );
}
