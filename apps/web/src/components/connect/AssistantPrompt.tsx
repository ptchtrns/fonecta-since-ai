import { createSignal, For, Show } from 'solid-js';
import { ApiError, apiSend } from '~/lib/api';
import { formatDay, formatHours } from '~/lib/hours';
import type { Check } from '~/lib/visibility';
import type { Workspace } from '~/queries/workspace';
import { SendIcon } from './icons';
import { useCopilot } from '~/components/copilot/CopilotProvider';
import { Card } from './Metrics';

// The front page's question box. The questions it offers are answered at once from the business's own data. Anything
// else goes to the copilot (components/copilot), which can also look things up and prepare changes for the owner to
// confirm. Outside the dashboard's copilot, typed questions go to the language model (`/api/workspace/ask`).

type Reply = {
  question: string;
  lines: string[];
  link?: { href: string; label: string };
  /** The model that wrote it, or null for an answer from the data. */
  model?: string | null;
  pending?: boolean;
  error?: boolean;
};
type Turn = { role: 'user' | 'assistant'; content: string };
type Question = { text: string; answer: () => Reply };

// "Live on Google" becomes "live on Google" mid-sentence.
const midSentence = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);
const missingOf = (checks: Check[]) => checks.filter((c) => !c.done).sort((a, b) => b.points - a.points);

function questions(w: Workspace): Question[] {
  const { profile, search, ai, missingHolidays } = w.presence;
  const pending = w.suggestions.pending;
  return [
    {
      text: `Why is my profile score ${profile.score}?`,
      answer: () => {
        const missing = missingOf(profile.checks);
        const done = profile.checks.filter((c) => c.done);
        return {
          question: `Why is my profile score ${profile.score}?`,
          lines: [
            `Your profile has ${done.length} of the ${profile.checks.length} things customers look for: ${done.map((c) => midSentence(c.label)).join(', ')}.`,
            ...(missing.length
              ? missing.map((c) => `${c.label} is missing, worth ${c.points} points. ${c.detail}`)
              : ['Nothing is missing, so it’s the full 100.']),
          ],
          link: missing.length
            ? { href: '/dashboard/company', label: 'Open Company information' }
            : undefined,
        };
      },
    },
    {
      text: 'How do I get more visibility?',
      answer: () => {
        const steps = missingOf([...search.checks, ...ai.checks])
          .filter((c, i, all) => all.findIndex((x) => x.label === c.label) === i)
          .slice(0, 3);
        return {
          question: 'How do I get more visibility?',
          lines: [
            `Your local search score is ${search.score} / 100 and AI assistants can use ${ai.score} / 100 of what they look for.`,
            ...(steps.length
              ? steps.map((c) => `${c.label}: ${c.detail}`)
              : ['Everything Connecta AI checks is already done.']),
          ],
          link: { href: '/dashboard/visibility?tab=seo', label: 'Open Visibility' },
        };
      },
    },
    {
      text: 'What’s missing from my profile?',
      answer: () => {
        const missing = missingOf(profile.checks);
        const lines = missing.map((c) => `${c.label}: ${c.detail}`);
        if (missingHolidays.length)
          lines.push(
            `No hours yet for ${missingHolidays.map((h) => `${h.label} (${formatDay(h.date)})`).join(', ')}.`,
          );
        return {
          question: 'What’s missing from my profile?',
          lines: lines.length ? lines : ['Nothing. Everything customers look for is there.'],
          link: missing.length
            ? { href: '/dashboard/company', label: 'Open Company information' }
            : undefined,
        };
      },
    },
    {
      text: 'Explain my suggestions',
      answer: () => {
        const top = pending[0];
        if (!top)
          return {
            question: 'Explain my suggestions',
            lines: ['Nothing is waiting for you. Connecta AI checks your special days every night.'],
          };
        const what =
          top.kind === 'closure'
            ? 'Customers say you may have closed for good, so we ask before anything changes.'
            : `For ${top.label} (${formatDay(top.date!)}) we suggest ${formatHours(top.suggested ?? '').toLowerCase()}, where Google shows ${formatHours(top.shown).toLowerCase()}.`;
        return {
          question: 'Explain my suggestions',
          lines: [
            `${pending.length} ${pending.length === 1 ? 'suggestion is' : 'suggestions are'} waiting, most important first: how sure we are, how many people look you up that day, and how soon it is.`,
            what,
            ...top.reasons.slice(0, 2),
            'Nothing is published until you answer.',
          ],
        };
      },
    },
  ];
}

export function AssistantPrompt(props: { workspace: Workspace }) {
  const copilot = useCopilot();
  const [text, setText] = createSignal('');
  const [thread, setThread] = createSignal<Reply[]>([]);
  const list = () => questions(props.workspace);
  const busy = () => thread().some((r) => r.pending);

  /** The conversation so far, for the model. */
  const history = (): Turn[] =>
    thread()
      .filter((r) => !r.pending && !r.error)
      .flatMap((r) => [
        { role: 'user' as const, content: r.question },
        { role: 'assistant' as const, content: r.lines.join('\n') },
      ]);

  async function askModel(q: string) {
    const earlier = history();
    setThread((t) => [...t, { question: q, lines: [], pending: true }]);
    const settle = (reply: Reply) => setThread((t) => [...t.slice(0, -1), reply]);
    try {
      const { data } = await apiSend<{ answer: string; model: string }>('/api/workspace/ask', 'POST', {
        mode: 'owner',
        question: q,
        history: earlier,
      });
      settle({ question: q, lines: data!.answer.split(/\n+/).filter(Boolean), model: data!.model });
    } catch (error) {
      settle({
        question: q,
        lines: [
          error instanceof ApiError ? error.message : 'Connecta AI didn’t answer. Try again in a moment.',
        ],
        error: true,
      });
    }
  }

  function ask(question: string) {
    const q = question.trim();
    if (!q || busy()) return;
    setText('');
    const known = list().find((x) => x.text.toLowerCase() === q.toLowerCase());
    if (known) {
      setThread((t) => [...t, { ...known.answer(), model: null }]);
      return;
    }
    if (copilot && props.workspace.ai.enabled) {
      void copilot.openPanel({ ask: q });
      return;
    }
    if (!props.workspace.ai.enabled) {
      setThread((t) => [
        ...t,
        {
          question: q,
          lines: [
            'No language model is connected, so Connecta AI can only answer the questions below, from your profile.',
          ],
          error: true,
        },
      ]);
      return;
    }
    void askModel(q);
  }

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    ask(text());
  }

  // Enter sends, Shift+Enter starts a new line.
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      ask(text());
    }
  }

  return (
    <section
      class="flex flex-col items-center gap-5 py-2 text-center sm:py-6"
      aria-labelledby="assistant-title"
    >
      <h2 id="assistant-title" class="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        What would you like to improve today?
      </h2>
      <form
        class="flex w-full max-w-2xl items-end gap-2 rounded-box border border-base-300 bg-base-100 p-2 pl-4 text-left focus-within:border-base-content/40"
        onSubmit={onSubmit}
      >
        <textarea
          class="min-h-12 flex-1 resize-none bg-transparent py-2 text-base outline-none placeholder:text-base-content/40"
          rows={2}
          maxlength={300}
          aria-label="Ask Connecta AI"
          placeholder={`Ask anything about your business profile — improve visibility, suggest missing info, explain your stats…`}
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          class="btn btn-square btn-primary"
          aria-label="Ask"
          disabled={!text().trim() || busy()}
        >
          <SendIcon class="size-4" />
        </button>
      </form>
      <ul class="flex max-w-2xl flex-wrap justify-center gap-2">
        <For each={list()}>
          {(q) => (
            <li>
              <button
                type="button"
                class="btn btn-sm rounded-full border-base-300 bg-base-100 font-normal"
                onClick={() => ask(q.text)}
              >
                {q.text}
              </button>
            </li>
          )}
        </For>
      </ul>

      <Show when={thread().length}>
        <Card
          class="w-full max-w-2xl text-left"
          label="Connecta AI"
          aside={props.workspace.ai.model ? `Typed questions: ${props.workspace.ai.model}` : undefined}
        >
          <ol class="flex flex-col gap-5" aria-live="polite">
            <For each={thread()}>
              {(r) => (
                <li class="flex flex-col gap-2">
                  <p class="font-semibold">{r.question}</p>
                  <Show
                    when={!r.pending}
                    fallback={<span class="loading loading-dots loading-sm" aria-label="Thinking" />}
                  >
                    <For each={r.lines}>
                      {(line) => (
                        <p class={['text-sm', r.error ? 'text-base-content/60' : 'text-base-content/80']}>
                          {line}
                        </p>
                      )}
                    </For>
                    <Show when={r.link}>
                      {(link) => (
                        <a href={link().href} class="btn btn-sm btn-primary self-start">
                          {link().label}
                        </a>
                      )}
                    </Show>
                    <Show when={!r.error}>
                      <p class="text-xs text-base-content/40">
                        {r.model ? `Written by ${r.model} from your profile` : 'From your profile'}
                      </p>
                    </Show>
                  </Show>
                </li>
              )}
            </For>
          </ol>
          <button type="button" class="btn btn-ghost btn-sm self-start" onClick={() => setThread([])}>
            Clear
          </button>
        </Card>
      </Show>
    </section>
  );
}
