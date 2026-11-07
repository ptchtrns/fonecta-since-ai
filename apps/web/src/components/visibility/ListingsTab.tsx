import { For, Show } from 'solid-js';
import { Card, ScoreCard, SegmentBar, StatCard } from '~/components/connect/Metrics';
import { LogoStrip, PublisherLogo } from '~/components/connect/PublisherLogo';
import {
  formatDuration,
  listingsSummary,
  speedGroups,
  updateSpeed,
  type ListingSite,
} from '~/lib/visibility';

const statusLabels: Record<string, string> = {
  LIVE: 'Live',
  WAITING_ON_PUBLISHER: 'Waiting',
  OPTED_OUT: 'Opted out',
};

/** Every site the profile is published to, how soon a change shows on each, and what needs the owner. */
export function ListingsTab(props: { name: string; listings: ListingSite[] }) {
  const summary = () => listingsSummary(props.listings);
  const live = () => props.listings.filter((l) => l.live);

  return (
    <Show
      when={props.listings.length}
      fallback={
        <Card>
          <p class="py-6 text-center text-base-content/60">
            Your profile isn’t published to any site yet. A new business is usually listed within a few days.
          </p>
        </Card>
      }
    >
      <div class="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <ScoreCard
          label="Listings"
          aside={`${summary().live} of ${summary().total} live`}
          value={summary().live}
          of={`/ ${summary().total} sites`}
          text={`${props.name} is live from Google and Facebook to car navigation. Change something once in Connecta AI and all of them update.`}
        >
          <SegmentBar segments={props.listings.map((l) => ({ weight: 1, filled: l.live, label: l.name }))} />
          <div class="border-t border-base-300 pt-4">
            <LogoStrip sites={live()} />
          </div>
        </ScoreCard>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatCard
            label="Everywhere within"
            value={summary().live ? formatDuration(summary().slowestSeconds) : '—'}
            text="The slowest site to pick up a change"
          />
          <StatCard
            label="Accounts to link"
            value={summary().needsAccount}
            text={
              summary().needsAccount
                ? 'Listed, but you can’t reply to reviews there'
                : 'Every site you are on is linked to your own account'
            }
          />
        </div>
      </div>

      <Card label="When a change goes live" aside="From each site’s typical update speed">
        <ol class="grid gap-3 md:grid-cols-3">
          <For each={speedGroups(props.listings)}>
            {(group, i) => (
              <li class="flex flex-col gap-3 rounded-box border border-base-300 p-4">
                <div class="flex items-center gap-2">
                  <span class="grid size-5 place-items-center rounded-full bg-base-content text-xs font-semibold text-base-100">
                    {i() + 1}
                  </span>
                  <span class="flex-1 font-medium">{group.label}</span>
                  <span class="text-xs text-base-content/50">
                    {group.sites.length} {group.sites.length === 1 ? 'site' : 'sites'}
                  </span>
                </div>
                <Show when={group.sites.length} fallback={<p class="text-sm text-base-content/40">None</p>}>
                  <LogoStrip sites={group.sites} />
                </Show>
              </li>
            )}
          </For>
        </ol>
      </Card>

      <Card label="All sites" aside={`${props.listings.length} sites`}>
        <ul class="flex flex-col divide-y divide-base-300">
          <For each={props.listings}>
            {(site) => (
              <li class="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                <span class="flex min-w-0 flex-1 items-center gap-3">
                  <PublisherLogo name={site.logo} size="sm" />
                  <span class="truncate font-medium">{site.name}</span>
                </span>
                <Show when={site.needsAccount}>
                  <span class="text-sm text-base-content/50">Account not linked</span>
                </Show>
                <span class="text-sm text-base-content/50">{updateSpeed(site.seconds)}</span>
                <span class={['badge badge-sm w-20', site.live ? 'badge-neutral' : 'badge-ghost']}>
                  {statusLabels[site.status] ?? site.status.toLowerCase()}
                </span>
              </li>
            )}
          </For>
        </ul>
      </Card>
    </Show>
  );
}
