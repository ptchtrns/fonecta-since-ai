import { Title } from '@solidjs/meta';
import { createSignal, For, Show } from 'solid-js';

type Message = { role: 'user' | 'assistant'; text: string };

const suggestions = ['Summarize my recent jobs', 'Which uploads are largest?', 'Draft a weekly report'];

// Chat UI only. No model is connected yet: replies are a placeholder until an /api/ai route exists.
export default function DashboardAi() {
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [draft, setDraft] = createSignal('');

  function send(text: string) {
    const prompt = text.trim();
    if (!prompt) return;
    setMessages((list) => [
      ...list,
      { role: 'user', text: prompt },
      { role: 'assistant', text: 'AI is not connected yet. Add an /api/ai route to get real answers.' },
    ]);
    setDraft('');
  }

  return (
    <div class="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col gap-4 lg:h-[calc(100vh-4rem)]">
      <Title>AI</Title>
      <h1 class="text-3xl font-bold">AI assistant</h1>

      <section class="card card-border flex-1 overflow-hidden border-base-300 bg-base-100">
        <div class="card-body min-h-0 gap-4 overflow-y-auto">
          <Show
            when={messages().length}
            fallback={
              <div class="m-auto flex flex-col items-center gap-4 text-center">
                <span class="grid size-12 place-items-center rounded-box bg-primary/10 text-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="size-6 stroke-current">
                    <path d="M10 3 8.5 7.5 4 9l4.5 1.5L10 15l1.5-4.5L16 9l-4.5-1.5L10 3ZM18 14l-.75 2.25L15 17l2.25.75L18 20l.75-2.25L21 17l-2.25-.75L18 14Z" />
                  </svg>
                </span>
                <p class="text-base-content/60">Ask anything about your workspace.</p>
                <div class="flex flex-wrap justify-center gap-2">
                  <For each={suggestions}>
                    {(s) => (
                      <button type="button" class="btn btn-sm btn-outline border-base-300 font-normal" onClick={() => send(s)}>
                        {s}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            }
          >
            <For each={messages()}>
              {(m) => (
                <div class={['chat', m.role === 'user' ? 'chat-end' : 'chat-start']}>
                  <div class={['chat-bubble', m.role === 'user' ? 'chat-bubble-primary' : 'bg-base-300']}>
                    {m.text}
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>

        <form
          class="flex gap-2 border-t border-base-300 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft());
          }}
        >
          <input
            class="input flex-1 border-base-300 bg-base-200"
            placeholder="Message the assistant…"
            value={draft()}
            onInput={(e) => setDraft(e.currentTarget.value)}
          />
          <button type="submit" class="btn btn-primary" disabled={!draft().trim()}>
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
