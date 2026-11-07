import { Title } from '@solidjs/meta';
import { revalidate, type RouteDefinition } from '@solidjs/router';
import { createMemo, For, Show } from 'solid-js';
import { FormMessage } from '~/components/FormMessage';
import { Page, PageHeader, Panel } from '~/components/connect/Page';
import { PublisherLogo } from '~/components/connect/PublisherLogo';
import type { SourceKind } from '~/db/schema';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { timeAgo } from '~/lib/format';
import { formatDay } from '~/lib/hours';
import { getWorkspace, type Workspace } from '~/queries/workspace';
import { sourceNames } from '~/components/connect/SuggestionCard';
import { linkSourceSchema } from '~/schemas/business.schema';

export const route = {
  preload: () => void getWorkspace(),
} satisfies RouteDefinition;

const linkable: { kind: SourceKind; name: string; logo: string; placeholder: string }[] = [
  { kind: 'website', name: 'Website', logo: 'Website', placeholder: 'https://yourbusiness.fi/opening-hours' },
  {
    kind: 'facebook',
    name: 'Facebook page',
    logo: 'Facebook',
    placeholder: 'https://facebook.com/yourbusiness',
  },
  {
    kind: 'instagram',
    name: 'Instagram',
    logo: 'Instagram',
    placeholder: 'https://instagram.com/yourbusiness',
  },
  { kind: 'other', name: 'Other page', logo: 'Other', placeholder: 'Booking page, shopping centre page…' },
];

const safeguards = [
  'Nothing is published without your approval or your standing permission.',
  'If a linked page disagrees with a suggestion, it never goes out or applies by itself. It waits here with a warning.',
  'If customers report you have shut down, we ask you first and a person at Fonecta handles it. Your listing is not changed automatically.',
  'A “No thanks” is final. We don’t ask about that day again.',
];

export default function Sources() {
  const workspace = createMemo(() => getWorkspace() as Promise<Workspace>);
  const disputed = () => workspace().suggestions.pending.filter((s) => s.checks.some((c) => !c.agrees));

  return (
    <Page class="max-w-3xl">
      <Title>Sources · Connecta AI</Title>
      <PageHeader
        title="Sources"
        subtitle="How wrong suggestions are prevented: every one is checked against these."
      />

      <Show when={disputed().length}>
        <div role="alert" class="alert alert-warning alert-soft">
          <span>
            Your linked pages disagree about{' '}
            {disputed()
              .map((s) => formatDay(s.date!))
              .join(', ')}
            .{' '}
            <a href="/dashboard" class="link">
              Review
            </a>
          </span>
        </div>
      </Show>

      <Panel title="Linked by you" subtitle="We read these every night and compare the hours they give.">
        <ul class="flex flex-col divide-y divide-base-300">
          <For each={linkable}>
            {(source) => (
              <SourceRow
                source={source}
                linked={workspace().sources.linked.find((l) => l.kind === source.kind)}
                suggestedUrl={source.kind === 'website' ? workspace().business.website : ''}
              />
            )}
          </For>
        </ul>
      </Panel>

      <Panel title="Always compared">
        <ul class="flex flex-col gap-2 text-sm">
          <For each={workspace().sources.builtIn}>
            {(source) => (
              <li class="flex items-baseline justify-between gap-4">
                <span class="flex items-center gap-2">
                  <span class={['status', source.active ? 'status-success' : 'status-neutral opacity-30']} />
                  {source.name}
                </span>
                <span class="text-right text-base-content/60">{source.detail}</span>
              </li>
            )}
          </For>
        </ul>
      </Panel>

      <Panel title="Safeguards">
        <ul class="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          <For each={safeguards}>{(rule) => <li>{rule}</li>}</For>
        </ul>
      </Panel>
    </Page>
  );
}

function SourceRow(props: {
  source: (typeof linkable)[number];
  linked: Workspace['sources']['linked'][number] | undefined;
  suggestedUrl: string;
}) {
  const form = createFormState();
  const removal = createFormState();

  function link(url: string) {
    const payload = form.validate(linkSourceSchema, { kind: props.source.kind, url });
    if (!payload) return;
    return form.submit(
      async () => (await apiSend('/api/workspace/sources', 'POST', payload)).message,
      () => revalidate(getWorkspace.key),
    );
  }

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    return link(String(new FormData(event.currentTarget as HTMLFormElement).get('url') ?? ''));
  }

  function remove() {
    return removal.submit(
      async () => {
        await apiSend(`/api/workspace/sources/${props.source.kind}`, 'DELETE', {});
      },
      () => revalidate(getWorkspace.key),
    );
  }

  return (
    <li class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div class="flex items-center gap-3">
        <PublisherLogo name={props.source.logo} size="sm" />
        <Show
          when={props.linked}
          fallback={
            <form class="join min-w-0 flex-1" onSubmit={onSubmit} novalidate>
              <input
                name="url"
                type="url"
                class={['input input-sm join-item w-full', { 'input-error': !!form.fieldErrors().url }]}
                aria-label={`${props.source.name} address`}
                placeholder={props.source.placeholder}
                defaultValue={props.suggestedUrl}
              />
              <button type="submit" class="btn btn-sm join-item" disabled={form.pending()}>
                <Show when={form.pending()}>
                  <span class="loading loading-spinner loading-xs" />
                </Show>
                Link
              </button>
            </form>
          }
        >
          {(linked) => (
            <>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-medium">{sourceNames[props.source.kind]}</span>
                  <span
                    class={[
                      'badge badge-xs',
                      linked().status === 'read' ? 'badge-neutral' : 'badge-warning badge-soft',
                    ]}
                  >
                    {linked().status === 'read' ? 'Linked' : 'Could not read'}
                  </span>
                </div>
                <a
                  href={linked().url}
                  target="_blank"
                  rel="noreferrer"
                  class="link-hover link block truncate text-sm text-base-content/60"
                >
                  {linked().url.replace(/^https?:\/\//, '')}
                </a>
                <p class="text-xs text-base-content/50">
                  Checked {timeAgo(linked().checkedAt)} ·{' '}
                  {linked().days
                    ? `hours for ${linked().days} ${linked().days === 1 ? 'day' : 'days'}`
                    : 'no hours for specific days'}
                </p>
              </div>
              <span class="flex shrink-0 gap-1">
                <button
                  type="button"
                  class="btn btn-ghost btn-xs"
                  disabled={form.pending()}
                  onClick={() => link(linked().url)}
                >
                  <Show when={form.pending()}>
                    <span class="loading loading-spinner loading-xs" />
                  </Show>
                  Check again
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs"
                  disabled={removal.pending()}
                  onClick={remove}
                >
                  Remove
                </button>
              </span>
            </>
          )}
        </Show>
      </div>
      <Show when={form.fieldErrors().url}>
        <span class="text-sm text-error">{form.fieldErrors().url}</span>
      </Show>
      <FormMessage message={form.message()} />
      <FormMessage message={removal.message()} />
    </li>
  );
}
