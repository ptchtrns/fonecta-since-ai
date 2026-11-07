import { Title } from '@solidjs/meta';
import { useSearchParams, type RouteDefinition } from '@solidjs/router';
import type { JSX } from '@solidjs/web';
import { createMemo, For, Match, Show, Switch } from 'solid-js';
import { ChatIcon, GlobeIcon, SearchIcon } from '~/components/connect/icons';
import { Page, PageHeader } from '~/components/connect/Page';
import { AiTab } from '~/components/visibility/AiTab';
import { ListingsTab } from '~/components/visibility/ListingsTab';
import { SearchTab } from '~/components/visibility/SearchTab';
import { visibilityCounts } from '~/lib/visibility';
import { getWorkspace, type Workspace } from '~/queries/workspace';

export const route = {
  preload: () => void getWorkspace(),
} satisfies RouteDefinition;

type Tab = 'listings' | 'seo' | 'ai';

// Each tab is a link (?tab=seo), so a tab can be bookmarked or linked to from other pages.
const tabs: { id: Tab; label: string; icon: () => JSX.Element }[] = [
  { id: 'listings', label: 'Listings', icon: () => <GlobeIcon class="size-4" /> },
  { id: 'seo', label: 'SEO', icon: () => <SearchIcon class="size-4" /> },
  { id: 'ai', label: 'AI', icon: () => <ChatIcon class="size-4" /> },
];

/** How findable the business is: on listing sites, in Google search, and to AI assistants. */
export default function Visibility() {
  const workspace = createMemo(() => getWorkspace() as Promise<Workspace>);
  const [params] = useSearchParams();
  const tab = (): Tab => tabs.find((t) => t.id === params.tab)?.id ?? 'listings';
  const counts = () => visibilityCounts(workspace().presence);

  return (
    <Page>
      <Title>Visibility · Connecta AI</Title>
      <PageHeader
        title="Visibility"
        subtitle={`How easily customers find ${workspace().business.name} on listing sites, on Google and through AI assistants.`}
      />

      <nav class="flex gap-8 overflow-x-auto border-b border-base-300" aria-label="Visibility">
        <For each={tabs}>
          {(t) => (
            <a
              href={`/dashboard/visibility?tab=${t.id}`}
              aria-current={tab() === t.id ? 'page' : undefined}
              class={[
                '-mb-px flex items-center gap-2 border-b-2 pb-3 font-medium whitespace-nowrap transition-colors',
                tab() === t.id
                  ? 'border-base-content text-base-content'
                  : 'border-transparent text-base-content/50 hover:text-base-content/80',
              ]}
            >
              {t.icon()}
              {t.label}
              <Show when={counts()[t.id]}>
                {(n) => <span class="font-mono text-xs text-base-content/50 tabular-nums">{n()}</span>}
              </Show>
            </a>
          )}
        </For>
      </nav>

      <Switch>
        <Match when={tab() === 'seo'}>
          <SearchTab workspace={workspace()} />
        </Match>
        <Match when={tab() === 'ai'}>
          <AiTab workspace={workspace()} />
        </Match>
        <Match when={tab() === 'listings'}>
          <ListingsTab name={workspace().business.name} listings={workspace().presence.listings} />
        </Match>
      </Switch>
    </Page>
  );
}
