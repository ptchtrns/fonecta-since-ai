import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { AssistantPrompt } from '~/components/connect/AssistantPrompt';
import { CompactChecklist } from '~/components/connect/Checklist';
import { ArrowRightIcon } from '~/components/connect/icons';
import { Card, eyebrow, Meter, StatCard } from '~/components/connect/Metrics';
import { Page, Panel } from '~/components/connect/Page';
import { LogoStrip } from '~/components/connect/PublisherLogo';
import { SuggestionCard } from '~/components/connect/SuggestionCard';
import { formatDay, formatHours } from '~/lib/hours';
import { suggestionStats } from '~/lib/report';
import { getWorkspace, type Workspace } from '~/queries/workspace';

export const route = {
  preload: () => void getWorkspace(),
} satisfies RouteDefinition;

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

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The dashboard layout only renders this once the account has a business.
export default function FrontPage() {
  const workspace = createMemo(() => getWorkspace() as Promise<Workspace>);
  const presence = () => workspace().presence;
  const pending = () => workspace().suggestions.pending;
  const stats = () => suggestionStats(pending().length, workspace().suggestions.handled);
  const live = () => presence().listings.filter((l) => l.live);
  const missing = () => presence().profile.checks.filter((c) => !c.done).length;
  const [showAll, setShowAll] = createSignal(false);
  const [notice, setNotice] = createSignal('');
  const visible = () => (showAll() ? pending() : pending().slice(0, 1));

  return (
    <Page>
      <Title>{`${workspace().business.name} · Connecta AI`}</Title>
      <AssistantPrompt workspace={workspace()} />

      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Profile strength"
          value={presence().profile.score}
          text={missing() ? `${plural(missing(), 'thing')} missing` : 'Complete'}
          href="/dashboard/company"
        />
        <StatCard
          label="Waiting for you"
          value={pending().length}
          text="Suggestions to answer"
          href="#suggestions"
        />
        <StatCard
          label="Published"
          value={stats().published}
          text="Changes live everywhere"
          href="/dashboard/reports"
        />
        <StatCard
          label="Live on"
          value={live().length}
          text={`of ${plural(presence().listings.length, 'site')}`}
          href="/dashboard/visibility"
        />
      </div>

      <div class="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <div class="flex min-w-0 flex-col gap-6">
          <section
            id="suggestions"
            class="flex scroll-mt-8 flex-col gap-4"
            aria-labelledby="suggestions-title"
          >
            <div class="flex items-baseline justify-between gap-3">
              <h2 id="suggestions-title" class={eyebrow}>
                {showAll() ? 'Suggestions' : 'Next suggestion'}
              </h2>
              <Show when={!showAll() && pending().length > 1}>
                <button
                  type="button"
                  class="flex items-center gap-1 text-sm font-medium hover:underline"
                  onClick={() => setShowAll(true)}
                >
                  See all {pending().length} <ArrowRightIcon />
                </button>
              </Show>
            </div>
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
          </section>

          <div class="grid items-start gap-4 sm:grid-cols-2">
            <ReviewsCard reviews={presence().reviews} />

            <Show when={presence().googleEdits.length}>
              <Card label="Suggested edits" aside={String(presence().googleEdits.length)}>
                <ul class="flex flex-col gap-3 text-sm">
                  <For each={presence().googleEdits}>
                    {(edit) => (
                      <li class="flex flex-col">
                        <span class="font-medium">{edit.change}</span>
                        <span class="text-xs text-base-content/50">
                          Suggested on {edit.site}, {formatDay(edit.created)}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
                <p class="text-xs text-base-content/50">
                  People suggested these changes to your listing on Google and other sites. They wait for your
                  answer, and Connecta AI weighs them in its suggestions.
                </p>
              </Card>
            </Show>
          </div>
        </div>

        <aside class="flex flex-col gap-4" aria-label="Your profile at a glance">
          <WhatsAppCard whatsapp={workspace().whatsapp} />

          <Card
            label="Profile"
            aside={`${presence().profile.checks.length - missing()} of ${presence().profile.checks.length}`}
          >
            <Meter value={presence().profile.score / 100} label="Profile strength" />
            <CompactChecklist checks={presence().profile.checks} columns={1} />
          </Card>

          <Card
            label="Where you're listed"
            aside={
              <a
                href="/dashboard/visibility"
                class="flex items-center gap-1 font-medium text-base-content hover:underline"
              >
                All <ArrowRightIcon />
              </a>
            }
          >
            <Show
              when={live().length}
              fallback={<p class="text-sm text-base-content/60">Not live on any site yet.</p>}
            >
              <LogoStrip sites={live()} />
              <p class="text-sm text-base-content/60">
                Live on {live().length} of {plural(presence().listings.length, 'site')}. A change here updates
                all of them.
              </p>
            </Show>
          </Card>
        </aside>
      </div>
    </Page>
  );
}

function WhatsAppCard(props: { whatsapp: Workspace['whatsapp'] }) {
  return (
    <Card
      label="WhatsApp"
      aside={
        <span class={['font-medium', props.whatsapp.on ? 'text-success' : 'text-base-content/50']}>
          {props.whatsapp.on ? 'On' : 'Off'}
        </span>
      }
    >
      <Show
        when={props.whatsapp.on && props.whatsapp.phone}
        fallback={
          <p class="text-sm text-base-content/70">
            Answer suggestions with one tap, without logging in.{' '}
            <a href="/dashboard/integrations" class="link">
              Turn it on
            </a>
          </p>
        }
      >
        <p class="flex items-start gap-2 text-sm">
          <span class="status status-success mt-1.5" aria-hidden="true" />
          <span>
            New suggestions go to <strong class="whitespace-nowrap">{props.whatsapp.phone}</strong>
          </span>
        </p>
      </Show>
    </Card>
  );
}

function ReviewsCard(props: { reviews: Workspace['presence']['reviews'] }) {
  const latest = () => props.reviews.recent[0];
  return (
    <Card label="Reviews" aside={props.reviews.count ? String(props.reviews.count) : undefined}>
      <Show
        when={props.reviews.count}
        fallback={
          <p class="text-sm text-base-content/60">No reviews yet. Google ranks reviewed places higher.</p>
        }
      >
        <p class="flex items-baseline gap-1.5">
          <span class="text-2xl font-semibold tabular-nums">{props.reviews.averageRating.toFixed(1)}</span>
          <span class="text-sm text-base-content/60">★ on average</span>
        </p>
        <Show when={latest()?.content}>
          <blockquote class="border-l-2 border-base-300 pl-3 text-sm text-base-content/70">
            <p class="line-clamp-3">“{latest()!.content}”</p>
            <footer class="mt-1 text-xs text-base-content/50">
              {latest()!.rating} ★ · {latest()!.site}, {formatDay(latest()!.date)}
            </footer>
          </blockquote>
        </Show>
      </Show>
    </Card>
  );
}
