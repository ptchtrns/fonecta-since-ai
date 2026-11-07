import { Title } from '@solidjs/meta';
import { revalidate, useParams, type RouteDefinition } from '@solidjs/router';
import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';
import { ConnectLogo } from '~/components/connect/ConnectLogo';
import { HoursInput } from '~/components/connect/HoursInput';
import { FormMessage } from '~/components/FormMessage';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { formatDay, formatHours } from '~/lib/hours';
import { updateTime } from '~/lib/messages';
import { answerLabels, expectedLookups, impactRest, suggestionHeadline } from '~/lib/suggestion-copy';
import { getOwnerSuggestion } from '~/queries/workspace';

export const route = {
  preload: ({ params }) => void getOwnerSuggestion(params.token!),
} satisfies RouteDefinition;

// Opened from the owner's message. No login: the token in the link is the credential.
export default function OwnerAnswer() {
  const params = useParams();
  const view = createMemo(() => getOwnerSuggestion(params.token!));
  const [edit, setEdit] = createSignal<string | null>(null);
  const form = createFormState();

  const s = () => view().snapshot;
  const answered = () => view().status !== 'pending';
  const labels = () => answerLabels(s().suggested);

  function send(action: 'approve' | 'edit' | 'decline') {
    return form.submit(
      async () => {
        await apiSend(`/api/s/${params.token}`, 'POST', {
          action,
          hours: action === 'edit' ? edit() : undefined,
        });
      },
      () => revalidate(getOwnerSuggestion.key),
    );
  }

  return (
    <main class="min-h-screen bg-base-200">
      <Title>{`${view().business.name} · Connecta AI`}</Title>
      <div class="mx-auto flex max-w-lg flex-col gap-4 px-4 py-6">
        <header>
          <ConnectLogo />
        </header>

        <Switch>
          <Match when={answered()}>
            <Done status={view().status} hours={view().hours} date={view().date} sites={view().sites} />
          </Match>
          <Match when={!view().open}>
            <section class="card card-border border-base-300 bg-base-100">
              <div class="card-body items-center text-center">
                <h1 class="text-xl font-semibold">This suggestion is no longer open</h1>
                <p class="text-sm text-base-content/60">The day has passed or the suggestion has changed.</p>
              </div>
            </section>
          </Match>
          <Match when={!answered()}>
            <div>
              <p class="text-base-content/60">Hi {view().business.owner}, a quick one about</p>
              <h1 class="text-2xl font-bold">{view().business.name}</h1>
            </div>

            <section class="card card-border border-base-300 bg-base-100">
              <div class="card-body gap-4 p-5">
                <div>
                  <h2 class="text-xl font-semibold text-balance">{suggestionHeadline(s().label)}</h2>
                  <p class="text-sm text-base-content/60">{formatDay(view().date)}</p>
                </div>

                <Show
                  when={edit() !== null}
                  fallback={
                    <dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 rounded-box bg-base-200 px-4 py-3">
                      <dt class="text-sm text-base-content/60">We suggest</dt>
                      <dd class="text-lg font-semibold">{formatHours(s().suggested ?? '')}</dd>
                      <dt class="text-sm text-base-content/60">Google shows</dt>
                      <dd class="text-sm text-base-content/60">{formatHours(s().shown)}</dd>
                    </dl>
                  }
                >
                  <HoursInput label="Your hours" value={edit()!} onChange={setEdit} />
                </Show>

                <Show when={expectedLookups(view().views)}>
                  {(people) => (
                    <p>
                      <strong>{people()}</strong> {impactRest(view().views!)}
                    </p>
                  )}
                </Show>

                <FormMessage message={form.message()} />

                <Show
                  when={edit() !== null}
                  fallback={
                    <div class="flex flex-col gap-2">
                      <button
                        type="button"
                        class="btn btn-primary btn-lg font-semibold"
                        disabled={form.pending()}
                        onClick={() => send('approve')}
                      >
                        {labels().confirm}
                      </button>
                      <button
                        type="button"
                        class="btn font-semibold"
                        disabled={form.pending()}
                        onClick={() => setEdit(s().suggested)}
                      >
                        {labels().edit}
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost"
                        disabled={form.pending()}
                        onClick={() => send('decline')}
                      >
                        {labels().dismiss}
                      </button>
                      <p class="text-center text-xs text-base-content/50">{labels().dismissHint}.</p>
                    </div>
                  }
                >
                  <div class="flex flex-col gap-2">
                    <button
                      type="button"
                      class="btn btn-primary btn-lg font-semibold"
                      disabled={form.pending()}
                      onClick={() => send('edit')}
                    >
                      {labels().save}
                    </button>
                    <button type="button" class="btn btn-ghost" onClick={() => setEdit(null)}>
                      Back
                    </button>
                  </div>
                </Show>

                <Show when={s().reasons.length}>
                  <details class="text-sm text-base-content/70">
                    <summary class="cursor-pointer text-base-content/50 select-none">
                      Why we suggest this
                    </summary>
                    <ul class="mt-2 flex list-disc flex-col gap-1 pl-5">
                      <For each={s().reasons}>{(reason) => <li>{reason}</li>}</For>
                    </ul>
                  </details>
                </Show>
              </div>
            </section>
          </Match>
        </Switch>
      </div>
    </main>
  );
}

function Done(props: {
  status: string;
  hours: string | null;
  date: string;
  sites: { name: string; seconds: number }[] | null;
}) {
  return (
    <section class="card card-border border-base-300 bg-base-100">
      <div class="card-body items-center gap-4 p-6 text-center">
        <Show
          when={props.status !== 'declined'}
          fallback={
            <>
              <h1 class="text-xl font-semibold">Got it, we'll leave it as it is</h1>
              <p class="text-sm text-base-content/60">We won't ask about this day again.</p>
            </>
          }
        >
          <h1 class="text-xl font-semibold">Done</h1>
          <p>
            {formatDay(props.date)} · <span class="font-semibold">{formatHours(props.hours ?? '')}</span>
          </p>
          <Show when={!props.sites}>
            <p class="text-sm text-base-content/60">
              Saved. It goes live once publishing to Yext is connected.
            </p>
          </Show>
          <ul class="flex w-full flex-col gap-1 text-left text-sm">
            <For each={props.sites ?? []}>
              {(site, i) => (
                <li
                  class="flex animate-reveal items-center justify-between rounded-field bg-base-200 px-3 py-2"
                  style={{ 'animation-delay': `${i() * 80}ms` }}
                >
                  {site.name}
                  <span class="text-base-content/60">within {updateTime(site.seconds)}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <p class="text-xs text-base-content/50">You can close this page.</p>
      </div>
    </section>
  );
}
