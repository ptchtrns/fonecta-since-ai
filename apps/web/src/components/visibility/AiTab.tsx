import { createSignal, For, onSettled, Show } from 'solid-js';
import { Checklist, checkSegments, NextStep } from '~/components/connect/Checklist';
import { ChatIcon, SendIcon } from '~/components/connect/icons';
import { Card, ScoreCard, SegmentBar, StatCard } from '~/components/connect/Metrics';
import { ApiError, apiGet, apiSend } from '~/lib/api';
import { assistantSources, nextStep } from '~/lib/visibility';
import type { Workspace } from '~/queries/workspace';

type Answer = { question: string; answer: string; known: boolean };
type ModelAnswers = { answers: Answer[]; model: string };

const statusStyle = {
  live: 'badge-neutral',
  waiting: 'badge-outline',
  'opted out': 'badge-ghost',
  'not listed': 'badge-ghost',
} as const;

/**
 * How AI assistants see the business: what they can answer from its listing data, and what's missing. With a language
 * model connected, the answers are a model's, given only the listing, as a stand-in for ChatGPT, Gemini or Siri.
 */
export function AiTab(props: { workspace: Workspace }) {
  const presence = () => props.workspace.presence;
  const report = () => presence().ai;
  const sources = () => assistantSources(presence().listings);
  const reached = () => sources().filter((s) => s.status === 'live');

  const [model, setModel] = createSignal<ModelAnswers | null>(null);
  const [modelError, setModelError] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  // The model's answers once they're in, the rule-based ones from the listing until then.
  const answers = (): Answer[] => model()?.answers ?? report().answers;
  const known = () => answers().filter((a) => a.known).length;

  async function loadAnswers() {
    setLoading(true);
    setModelError('');
    try {
      setModel(await apiGet<ModelAnswers>('/api/workspace/ai-answers'));
    } catch (error) {
      setModelError(error instanceof ApiError ? error.message : 'The language model didn’t answer.');
    } finally {
      setLoading(false);
    }
  }

  onSettled(() => {
    if (props.workspace.ai.enabled) void loadAnswers();
  });

  return (
    <>
      <div class="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <ScoreCard
          label="AI visibility"
          aside={`${report().checks.filter((c) => c.done).length} of ${report().checks.length} done`}
          value={report().score}
          of="/ 100"
          text={`More people ask ChatGPT, Gemini, Copilot or Siri instead of searching. They answer from listing data like yours, and can answer ${known()} of ${answers().length} common questions about ${props.workspace.business.name}.`}
        >
          <SegmentBar segments={checkSegments(report().checks)} />
          <Show when={nextStep(report().checks)}>{(step) => <NextStep check={step()} />}</Show>
        </ScoreCard>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatCard
            label="Questions answered"
            value={known()}
            of={`/ ${answers().length}`}
            text={
              model()
                ? `Answered by ${model()!.model} from your listing alone`
                : 'Common questions your listing has the answer to'
            }
          />
          <StatCard
            label="Assistants that find you"
            value={reached().length}
            of={`/ ${sources().length}`}
            text={
              reached().length
                ? reached()
                    .map((s) => s.assistants)
                    .join(', ')
                : 'None yet. They read Google, Bing and Apple Maps.'
            }
          />
        </div>
      </div>

      <div class="grid items-start gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-4">
          <Card label="What assistants need" aside={`${report().checks.length} checks`}>
            <Checklist checks={report().checks} />
          </Card>
          <Card label="Where assistants read about you" aside="From your listings">
            <ul class="flex flex-col divide-y divide-base-300 text-sm">
              <For each={sources()}>
                {(s) => (
                  <li class="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                    <span class="min-w-0">
                      <span class="block font-medium">{s.site}</span>
                      <span class="block text-xs text-base-content/60">{s.assistants}</span>
                    </span>
                    <span class={['badge badge-sm shrink-0', statusStyle[s.status]]}>{s.status}</span>
                  </li>
                )}
              </For>
            </ul>
          </Card>
        </div>

        <div class="flex flex-col gap-4">
          <Card
            label="What an assistant would say"
            aside={model() ? `${model()!.model}, from your listing` : 'From your listing'}
          >
            <Show when={loading()}>
              <p class="flex items-center gap-2 text-sm text-base-content/60" role="status">
                <span class="loading loading-dots loading-sm" />
                Asking a language model, which only sees your listing…
              </p>
            </Show>
            <Show when={modelError()}>
              <p class="text-sm text-base-content/60">
                {modelError()} These answers are written from your listing by rules instead.{' '}
                <button type="button" class="link" onClick={() => void loadAnswers()}>
                  Try again
                </button>
              </p>
            </Show>
            <Show when={!props.workspace.ai.enabled}>
              <p class="text-xs text-base-content/50">
                No language model is connected, so these answers are written from your listing by rules.
              </p>
            </Show>
            <Conversation answers={answers()} />
            <Show when={model()}>
              <p class="text-xs text-base-content/50">
                A stand-in for real assistants: the model gets your listing and nothing else. ChatGPT, Gemini
                and Siri also read other sites, so their answers can differ.
              </p>
            </Show>
          </Card>

          <Show when={props.workspace.ai.enabled}>
            <AskLikeACustomer name={props.workspace.business.name} />
          </Show>
        </div>
      </div>
    </>
  );
}

function Conversation(props: { answers: Answer[] }) {
  return (
    <ul class="flex flex-col gap-4">
      <For each={props.answers}>
        {(a) => (
          <li class="flex flex-col gap-1.5">
            <p class="self-end rounded-box rounded-br-sm bg-base-content px-3 py-1.5 text-sm text-base-100">
              {a.question}
            </p>
            <div
              class={[
                'flex max-w-[90%] gap-2 rounded-box rounded-bl-sm px-3 py-2 text-sm',
                a.known ? 'bg-base-200' : 'border border-dashed border-base-300 text-base-content/60',
              ]}
            >
              <ChatIcon class="mt-0.5 size-4 shrink-0 text-base-content/40" />
              <span>
                {a.answer}
                <Show when={!a.known}>
                  <span class="sr-only"> (missing from your listing)</span>
                </Show>
              </span>
            </div>
          </li>
        )}
      </For>
    </ul>
  );
}

/** Any question a customer might ask, answered by the model from the listing alone. */
function AskLikeACustomer(props: { name: string }) {
  const [text, setText] = createSignal('');
  const [answers, setAnswers] = createSignal<Answer[]>([]);
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal('');

  async function ask(event: SubmitEvent) {
    event.preventDefault();
    const question = text().trim();
    if (!question || pending()) return;
    setPending(true);
    setError('');
    try {
      const { data } = await apiSend<{ answer: string }>('/api/workspace/ask', 'POST', {
        mode: 'customer',
        question,
      });
      setAnswers((a) => [...a, { question, answer: data!.answer, known: true }]);
      setText('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The language model didn’t answer.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card label="Ask like a customer">
      <Conversation answers={answers()} />
      <form class="flex items-center gap-2" onSubmit={ask}>
        <input
          class="input input-sm flex-1"
          maxlength={300}
          aria-label="A customer's question"
          placeholder={`e.g. Can I bring my dog to ${props.name}?`}
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <button
          type="submit"
          class="btn btn-square btn-sm btn-primary"
          aria-label="Ask"
          disabled={!text().trim() || pending()}
        >
          <Show when={pending()} fallback={<SendIcon class="size-4" />}>
            <span class="loading loading-spinner loading-xs" />
          </Show>
        </button>
      </form>
      <Show when={error()}>
        <p class="text-sm text-error">{error()}</p>
      </Show>
    </Card>
  );
}
