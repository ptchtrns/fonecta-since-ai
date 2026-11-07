import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { BusinessCard } from '~/components/connect/BusinessCard';
import { Page, Panel, SectionTitle } from '~/components/connect/Page';
import { SuggestionCard } from '~/components/connect/SuggestionCard';
import { formatDay, formatHours } from '~/lib/hours';
import { getWorkspace, type Workspace } from '~/queries/workspace';

export const route = {
  preload: () => void getWorkspace(),
} satisfies RouteDefinition;

const SHOWN_AT_FIRST = 5;

const statusLabels = {
  approved: 'Approved',
  edited: 'Edited',
  declined: 'Declined',
  pending: 'Waiting',
} as const;
const channelLabels: Record<string, string> = {
  dashboard: 'here',
  link: 'from the link',
  whatsapp: 'on WhatsApp',
  standing: 'automatically',
};

// The dashboard layout only renders this once the account has a business.
export default function Home() {
  const workspace = createMemo(() => getWorkspace() as Promise<Workspace>);
  const pending = () => workspace().suggestions.pending;
  const [showAll, setShowAll] = createSignal(false);
  const [notice, setNotice] = createSignal('');
  const visible = () => (showAll() ? pending() : pending().slice(0, SHOWN_AT_FIRST));

  return (
    <Page>
      <Title>{`${workspace().business.name} · Connecta AI`}</Title>
      <div class="grid items-start gap-6 lg:grid-cols-[20rem_1fr]">
        <div class="order-2 lg:sticky lg:top-8 lg:order-1">
          <BusinessCard business={workspace().business} />
        </div>

        <div class="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
          <SectionTitle
            title="Suggestions"
            aside={pending().length ? `${pending().length} waiting, most important first` : undefined}
          />
          <Show when={notice()}>
            <div role="status" class="alert alert-success alert-soft">
              <span>{notice()}</span>
            </div>
          </Show>
          <For
            each={visible()}
            keyed={(s) => s.key}
            fallback={
              <Panel>
                <p class="py-6 text-center text-base-content/60">Nothing needs you right now.</p>
              </Panel>
            }
          >
            {(s) => <SuggestionCard suggestion={s()} onAnswered={setNotice} />}
          </For>
          <Show when={!showAll() && pending().length > SHOWN_AT_FIRST}>
            <button type="button" class="btn btn-sm btn-ghost self-center" onClick={() => setShowAll(true)}>
              Show all {pending().length}
            </button>
          </Show>

          <Show when={workspace().suggestions.handled.length}>
            <details class="collapse-arrow collapse rounded-box border border-base-300 bg-base-100">
              <summary class="collapse-title min-h-0 py-3 text-sm font-medium">
                Answered ({workspace().suggestions.handled.length})
              </summary>
              <ul class="collapse-content flex flex-col divide-y divide-base-300 text-sm">
                <For each={workspace().suggestions.handled}>
                  {(item) => (
                    <li class="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                      <span class="min-w-0">
                        <Show when={/^\d/.test(item.key)}>{formatDay(item.key)} · </Show>
                        {item.snapshot.label}
                        <Show when={item.hours}>
                          <span class="ml-2 font-medium tabular-nums">{formatHours(item.hours!)}</span>
                        </Show>
                      </span>
                      <span class="text-xs text-base-content/50">
                        {statusLabels[item.status]} {item.via ? channelLabels[item.via] : ''}
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </details>
          </Show>
        </div>
      </div>
    </Page>
  );
}
