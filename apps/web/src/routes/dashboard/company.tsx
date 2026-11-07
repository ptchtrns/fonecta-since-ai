import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { createMemo, For, Show } from 'solid-js';
import { BusinessCard } from '~/components/connect/BusinessCard';
import { CompactChecklist } from '~/components/connect/Checklist';
import { Card, Meter } from '~/components/connect/Metrics';
import { Page, PageHeader } from '~/components/connect/Page';
import { formatDay } from '~/lib/hours';
import { getWorkspace, type Workspace } from '~/queries/workspace';

export const route = {
  preload: () => void getWorkspace(),
} satisfies RouteDefinition;

/** The business's details as customers see them everywhere, with one form to change them. */
export default function CompanyInformation() {
  const workspace = createMemo(() => getWorkspace() as Promise<Workspace>);
  const presence = () => workspace().presence;
  const live = () => presence().listings.filter((l) => l.live).length;
  const done = () => presence().profile.checks.filter((c) => c.done).length;

  return (
    <Page>
      <Title>Company information · Connecta AI</Title>
      <PageHeader
        title="Company information"
        subtitle={`What customers see about ${workspace().business.name}${live() ? ` on ${live()} sites, from Google to car navigation` : ''}. Change it once here and every site updates.`}
      />
      <div class="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <BusinessCard business={workspace().business} />

        <div class="flex flex-col gap-6 lg:sticky lg:top-8">
          <Card label="Profile" aside={`${done()} of ${presence().profile.checks.length}`}>
            <Meter value={presence().profile.score / 100} label="Profile strength" />
            <CompactChecklist checks={presence().profile.checks} columns={1} points />
            <a href="/dashboard/reports" class="link link-hover text-sm text-base-content/60">
              Profile strength {presence().profile.score} / 100
            </a>
          </Card>

          <Show when={presence().missingHolidays.length}>
            <Card label="Holidays without hours">
              <ul class="flex flex-col gap-1.5 text-sm">
                <For each={presence().missingHolidays}>
                  {(day) => (
                    <li class="flex justify-between gap-4">
                      <span>{day.label}</span>
                      <span class="text-base-content/60 tabular-nums">{formatDay(day.date)}</span>
                    </li>
                  )}
                </For>
              </ul>
              <p class="text-xs text-base-content/50">
                Google shows your normal hours on these days until you say otherwise.
              </p>
            </Card>
          </Show>
        </div>
      </div>
    </Page>
  );
}
