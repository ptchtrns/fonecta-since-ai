import { createSignal, For, Show } from 'solid-js';
import { formatDay, formatHours } from '~/lib/hours';
import type { Check } from '~/lib/visibility';
import type { Workspace } from '~/queries/workspace';
import { SendIcon } from './icons';
import { Card } from './Metrics';

// The front page's question box. Connecta AI has no language model behind it yet, so it answers the questions it
// offers from the business's own data, and says so when asked anything else.

type Reply = { question: string; lines: string[]; link?: { href: string; label: string } };
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
  const [text, setText] = createSignal('');
  const [reply, setReply] = createSignal<Reply | null>(null);
  const list = () => questions(props.workspace);

  function ask(question: string) {
    const q = question.trim();
    if (!q) return;
    const known = list().find((x) => x.text.toLowerCase() === q.toLowerCase());
    setReply(
      known?.answer() ?? {
        question: q,
        lines: [
          'Connecta AI can’t answer questions of your own yet. It can answer the ones below from your profile.',
        ],
      },
    );
    setText('');
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
        <button type="submit" class="btn btn-square btn-primary" aria-label="Ask" disabled={!text().trim()}>
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

      <Show when={reply()}>
        {(r) => (
          <Card class="w-full max-w-2xl text-left" label="Connecta AI">
            <div role="status" class="flex flex-col gap-2">
              <p class="font-semibold">{r().question}</p>
              <For each={r().lines}>{(line) => <p class="text-sm text-base-content/80">{line}</p>}</For>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Show when={r().link}>
                {(link) => (
                  <a href={link().href} class="btn btn-sm btn-primary">
                    {link().label}
                  </a>
                )}
              </Show>
              <button type="button" class="btn btn-ghost btn-sm" onClick={() => setReply(null)}>
                Close
              </button>
            </div>
          </Card>
        )}
      </Show>
    </section>
  );
}
