import type { JSX } from '@solidjs/web';
import { Show, type ParentProps } from 'solid-js';

/** The page column every dashboard page uses, so they all line up the same way. */
export function Page(props: ParentProps<{ class?: string }>) {
  return <div class={['mx-auto flex w-full max-w-5xl flex-col gap-6', props.class]}>{props.children}</div>;
}

/** Title, one line on what the page is for, and the page's main action on the right. */
export function PageHeader(props: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actions?: JSX.Element;
}) {
  return (
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div class="min-w-0">
        <Show when={props.eyebrow}>
          <p class="text-sm text-base-content/60">{props.eyebrow}</p>
        </Show>
        <h1 class="text-2xl font-semibold tracking-tight">{props.title}</h1>
        <Show when={props.subtitle}>
          <p class="mt-1 max-w-2xl text-sm text-base-content/60">{props.subtitle}</p>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="flex flex-wrap items-center gap-2">{props.actions}</div>
      </Show>
    </header>
  );
}

/** A white card with an optional title row: the one building block for dashboard content. */
export function Panel(
  props: ParentProps<{ title?: string; subtitle?: string; action?: JSX.Element; class?: string }>,
) {
  return (
    <section class={['card card-border border-base-300 bg-base-100', props.class]}>
      <div class="card-body gap-4">
        <Show when={props.title || props.action}>
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Show when={props.title}>
                <h2 class="text-base font-semibold">{props.title}</h2>
              </Show>
              <Show when={props.subtitle}>
                <p class="text-sm text-base-content/60">{props.subtitle}</p>
              </Show>
            </div>
            {props.action}
          </div>
        </Show>
        {props.children}
      </div>
    </section>
  );
}

/** Heading for a list of cards that aren't inside a Panel, with a count or link on the right. */
export function SectionTitle(props: { title: string; aside?: JSX.Element }) {
  return (
    <div class="flex items-baseline justify-between gap-3">
      <h2 class="text-base font-semibold">{props.title}</h2>
      <span class="text-sm text-base-content/50">{props.aside}</span>
    </div>
  );
}
