import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { createMemo, For, Show } from 'solid-js';
import { checkSegments, CompactChecklist } from '~/components/connect/Checklist';
import { ArrowRightIcon } from '~/components/connect/icons';
import { Card, Meter, MeterRow, ScoreCard, SegmentBar, StatCard } from '~/components/connect/Metrics';
import { Page, PageHeader } from '~/components/connect/Page';
import { LogoStrip } from '~/components/connect/PublisherLogo';
import { TrafficChart } from '~/components/connect/TrafficChart';
import { formatDay } from '~/lib/hours';
import { siteUpdates, suggestionStats } from '~/lib/report';
import { getWorkspace, type Workspace } from '~/queries/workspace';

export const route = {
  preload: () => void getWorkspace(),
} satisfies RouteDefinition;

const strength = (score: number) =>
  score >= 90
    ? 'Customers find everything they look for.'
    : score >= 60
      ? 'Customers find most of what they look for.'
      : 'Customers miss much of what they look for.';

// Suggestion keys are dates, except the one question about a business that may have closed for good.
const isDay = (key: string) => /^\d/.test(key);

/** How the business looks online, and what Connecta AI has done for it. */
export default function Reports() {
  const workspace = createMemo(() => getWorkspace() as Promise<Workspace>);
  const presence = () => workspace().presence;
  const suggestions = () => workspace().suggestions;
  const stats = () => suggestionStats(suggestions().pending.length, suggestions().handled);
  const profile = () => presence().profile;
  const live = () => presence().listings.filter((l) => l.live);

  const findings = () => {
    const { pending, handled } = suggestions();
    return [
      {
        label: 'Special-day hours',
        count: pending.filter((p) => p.kind === 'hours').length + handled.filter((h) => isDay(h.key)).length,
      },
      {
        label: 'Possible closure',
        count:
          pending.filter((p) => p.kind === 'closure').length + handled.filter((h) => !isDay(h.key)).length,
      },
      { label: 'Edits suggested by users', count: presence().googleEdits.length },
      { label: 'Missing on your profile', count: profile().checks.filter((c) => !c.done).length },
    ].filter((f) => f.count);
  };
  const mostFound = () => Math.max(1, ...findings().map((f) => f.count));

  return (
    <Page>
      <Title>Reports · Connecta AI</Title>
      <PageHeader
        title="Reports"
        subtitle={`How ${workspace().business.name} looks online, and what Connecta AI has done for it.`}
      />

      <div class="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <ScoreCard
          label="Profile strength"
          aside={`${profile().checks.filter((c) => c.done).length} of ${profile().checks.length} complete`}
          value={profile().score}
          of="/ 100"
          text={strength(profile().score)}
        >
          <SegmentBar segments={checkSegments(profile().checks)} />
          <CompactChecklist checks={profile().checks} points />
          <div class="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-base-300 pt-4 text-sm">
            <span>
              Live on <strong>{live().length} sites</strong>
            </span>
            <LogoStrip sites={live()} />
          </div>
        </ScoreCard>

        <div class="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <StatCard
            label="Published"
            value={stats().published}
            text={
              stats().approvedNotLive
                ? `Confirmed by Yext. ${stats().approvedNotLive} more approved, saved here until Yext is connected`
                : `Confirmed by Yext, ${stats().publishedAfterEdit} edited by you first`
            }
          />
          <StatCard
            label="You said yes"
            value={stats().yesRate === null ? '—' : `${Math.round(stats().yesRate! * 100)}%`}
            text={`${stats().declined} dismissed, never asked again`}
          >
            <Meter value={stats().yesRate ?? 0} label="Share of suggestions you said yes to" />
          </StatCard>
          <StatCard
            label="Site updates sent"
            value={siteUpdates(stats().published, live().length)}
            text={`${stats().published} published ${stats().published === 1 ? 'change' : 'changes'} × ${live().length} live sites. ${stats().automatic} applied without asking, under your standing permission`}
          />
        </div>
      </div>

      <TrafficCard report={workspace().traffic} />

      <div class="grid items-start gap-4 md:grid-cols-2">
        <Card
          label="From suggestion to live"
          aside={
            <a href="/dashboard#suggestions" class="flex items-center gap-1 hover:underline">
              {stats().waiting} waiting <ArrowRightIcon />
            </a>
          }
        >
          <MeterRow label="Suggested" count={stats().suggested} total={stats().suggested} showShare />
          <MeterRow label="Answered" count={stats().answered} total={stats().suggested} showShare />
          <MeterRow
            label="Approved"
            count={stats().published + stats().approvedNotLive}
            total={stats().suggested}
            showShare
          />
          <MeterRow label="Published by Yext" count={stats().published} total={stats().suggested} showShare />
        </Card>

        <Card
          label="What Connecta AI found"
          aside={`${findings().reduce((sum, f) => sum + f.count, 0)} findings`}
        >
          <For each={findings()} fallback={<p class="text-sm text-base-content/60">Nothing yet.</p>}>
            {(f) => <MeterRow label={f.label} count={f.count} total={mostFound()} />}
          </For>
        </Card>

        <Card label="How you answer" aside={`${stats().answered} answered`}>
          <Show
            when={stats().answered}
            fallback={<p class="text-sm text-base-content/60">No answers yet. They show here by channel.</p>}
          >
            <For each={stats().byChannel}>
              {(c) => <MeterRow label={c.label} count={c.count} total={stats().answered} showShare />}
            </For>
          </Show>
        </Card>

        <Card
          label="Reviews"
          aside={
            presence().reviews.count
              ? `${presence().reviews.averageRating.toFixed(1)} ★ from ${presence().reviews.count}`
              : undefined
          }
        >
          <ul class="flex flex-col divide-y divide-base-300">
            <For
              each={presence().reviews.recent}
              fallback={
                <li class="text-sm text-base-content/60">
                  No reviews yet. Google ranks reviewed places higher.
                </li>
              }
            >
              {(r) => (
                <li class="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0">
                  <span class="flex justify-between gap-3 text-xs text-base-content/50">
                    <span>
                      <span class="font-medium text-base-content">{'★'.repeat(r.rating)}</span>
                      <span class="sr-only">{r.rating} stars</span> · {r.author}
                    </span>
                    <span>
                      {r.site}, {formatDay(r.date)}
                    </span>
                  </span>
                  <Show when={r.content}>
                    <p class="line-clamp-3 text-base-content/80">{r.content}</p>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Card>
      </div>
    </Page>
  );
}

const formatChange = (change: number | null) =>
  change === null
    ? 'No earlier period'
    : `${change >= 0 ? '+' : '−'}${Math.abs(Math.round(change * 100))}% vs the 4 weeks before`;

/** Google statistics: the last four weeks' totals and the daily views behind them. */
function TrafficCard(props: { report: Workspace['traffic'] }) {
  return (
    <Show
      when={props.report.traffic}
      fallback={
        <Card label="Google statistics">
          <p class="text-sm text-base-content/60">{props.report.unavailable}</p>
        </Card>
      }
    >
      {(t) => (
        <Card
          label="Google statistics"
          aside={`${formatDay(t().from)} – ${formatDay(t().to)}${t().source === 'dataset' ? ', latest in the data' : ''}`}
        >
          <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile label="Views" value={t().totals.views} text={formatChange(t().change.views)} />
            <Tile label="Searches" value={t().totals.searches} text={formatChange(t().change.searches)} />
            <Tile
              label="Actions"
              value={t().totals.actions}
              text={`Directions, calls and website clicks. ${formatChange(t().change.actions)}`}
            />
            <Tile label="Calls" value={t().totals.calls} text={formatChange(t().change.calls)} />
          </div>
          <TrafficChart
            points={t().daily}
            label={`Google Search and Maps views per day, ${formatDay(t().daily[0]!.date)} to ${formatDay(t().to)}`}
          />
          <p class="text-xs text-base-content/50">
            Google Search and Maps views per day, last 13 weeks. Holidays with wrong hours lose these people
            to a closed door, which is why suggestions for busy days come first.
          </p>
        </Card>
      )}
    </Show>
  );
}

function Tile(props: { label: string; value: number; text: string }) {
  return (
    <div class="flex flex-col gap-1">
      <span class="font-mono text-xs tracking-wider text-base-content/50 uppercase">{props.label}</span>
      <span class="text-2xl font-semibold tabular-nums">{props.value.toLocaleString('en-GB')}</span>
      <span class="text-xs text-base-content/60">{props.text}</span>
    </div>
  );
}
