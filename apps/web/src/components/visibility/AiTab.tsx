import { For, Show } from 'solid-js';
import { Checklist, checkSegments, NextStep } from '~/components/connect/Checklist';
import { ChatIcon } from '~/components/connect/icons';
import { Card, ScoreCard, SegmentBar, StatCard } from '~/components/connect/Metrics';
import { assistantsReached, nextStep } from '~/lib/visibility';
import type { Workspace } from '~/queries/workspace';

/** How AI assistants see the business: what they can answer from its listing data, and what's missing. */
export function AiTab(props: { workspace: Workspace }) {
  const presence = () => props.workspace.presence;
  const report = () => presence().ai;
  const known = () => report().answers.filter((a) => a.known).length;
  const reached = () => assistantsReached(presence().listings);

  return (
    <>
      <div class="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <ScoreCard
          label="AI visibility"
          aside={`${report().checks.filter((c) => c.done).length} of ${report().checks.length} done`}
          value={report().score}
          of="/ 100"
          text={`More people ask ChatGPT, Gemini, Copilot or Siri instead of searching. They answer from listing data like yours, and can answer ${known()} of ${report().answers.length} common questions about ${props.workspace.business.name}.`}
        >
          <SegmentBar segments={checkSegments(report().checks)} />
          <Show when={nextStep(report().checks)}>{(step) => <NextStep check={step()} />}</Show>
        </ScoreCard>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatCard
            label="Questions answered"
            value={known()}
            of={`/ ${report().answers.length}`}
            text="Common questions an assistant can answer from your listing"
          />
          <StatCard
            label="Assistants that find you"
            value={reached().length}
            of="/ 3"
            text={reached().length ? reached().join(', ') : 'None yet: they read Google, Bing and Apple Maps'}
          />
        </div>
      </div>

      <div class="grid items-start gap-4 lg:grid-cols-2">
        <Card label="What assistants need" aside={`${report().checks.length} checks`}>
          <Checklist checks={report().checks} />
        </Card>
        <Card label="What an assistant would say" aside="From your listing">
          <ul class="flex flex-col gap-4">
            <For each={report().answers}>
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
                    <ChatIcon class="mt-0.5 size-4 text-base-content/40" />
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
        </Card>
      </div>
    </>
  );
}
