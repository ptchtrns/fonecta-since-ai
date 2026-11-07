import type { JSX } from '@solidjs/web';
import { For, Show, type ParentProps } from 'solid-js';

// Building blocks for the number-led pages (front page, Visibility, Reports): a card with a small label, a big
// number, and bars. Ink only, so the numbers stand out.

/** Small upper-case label above a number or a card's content. Also for headings that should look like one. */
export const eyebrow = 'font-mono text-xs tracking-wider text-base-content/50 uppercase';

export function Eyebrow(props: ParentProps<{ class?: string }>) {
  return <p class={[eyebrow, props.class]}>{props.children}</p>;
}

/** A card with a small label on the left and a count or link on the right. */
export function Card(props: ParentProps<{ label?: string; aside?: JSX.Element; class?: string }>) {
  return (
    <section class={['card card-border border-base-300 bg-base-100', props.class]}>
      <div class="card-body gap-4">
        <Show when={props.label || props.aside}>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class={eyebrow}>{props.label}</h2>
            <span class="text-sm text-base-content/60">{props.aside}</span>
          </div>
        </Show>
        {props.children}
      </div>
    </section>
  );
}

/** "90 / 100": the number big, what it's out of small and grey. */
export function BigNumber(props: { value: string | number; of?: string; size?: 'lg' | 'md' }) {
  return (
    <p class="flex items-baseline gap-1.5 leading-none">
      <span
        class={[
          'font-semibold tracking-tight tabular-nums',
          props.size === 'md' ? 'text-3xl' : 'text-5xl sm:text-6xl',
        ]}
      >
        {props.value}
      </span>
      <Show when={props.of}>
        <span class="text-lg text-base-content/50">{props.of}</span>
      </Show>
    </p>
  );
}

/** A label, a number and one line on what it means. */
export function StatCard(
  props: ParentProps<{
    label: string;
    value: string | number;
    of?: string;
    text?: JSX.Element;
    href?: string;
  }>,
) {
  const body = () => (
    <div class="card-body gap-2 p-5">
      <Eyebrow>{props.label}</Eyebrow>
      <BigNumber value={props.value} of={props.of} size="md" />
      {props.children}
      <Show when={props.text}>
        <p class="text-sm text-base-content/60">{props.text}</p>
      </Show>
    </div>
  );
  return (
    <Show
      when={props.href}
      fallback={<section class="card card-border border-base-300 bg-base-100">{body()}</section>}
    >
      {(href) => (
        <a
          href={href()}
          class="card card-border border-base-300 bg-base-100 transition-colors hover:border-base-content/30"
        >
          {body()}
        </a>
      )}
    </Show>
  );
}

export type Segment = { weight: number; filled: boolean; label: string };

/** One bar split into parts, each as wide as it counts for: done parts dark, missing ones light. */
export function SegmentBar(props: { segments: Segment[] }) {
  return (
    <div class="flex h-2 w-full gap-0.5" role="img" aria-label={summary(props.segments)}>
      <For each={props.segments}>
        {(s) => (
          <span
            class={['h-full rounded-[1px]', s.filled ? 'bg-base-content' : 'bg-base-200']}
            style={{ 'flex-grow': s.weight, 'flex-basis': 0 }}
            title={s.label}
          />
        )}
      </For>
    </div>
  );
}

const summary = (segments: Segment[]) =>
  `${segments.filter((s) => s.filled).length} of ${segments.length} done`;

/** A thin progress bar for a share between 0 and 1. */
export function Meter(props: { value: number; muted?: boolean; label?: string }) {
  return (
    <div
      class="h-1.5 w-full rounded-full bg-base-200"
      role="progressbar"
      aria-label={props.label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(props.value * 100)}
    >
      <div
        class={['h-full rounded-full', props.muted ? 'bg-base-content/40' : 'bg-base-content']}
        style={{ width: `${Math.min(1, Math.max(0, props.value)) * 100}%` }}
      />
    </div>
  );
}

/** A labelled row with its count, a share, and a bar under it: one step of a funnel or one kind of finding. */
export function MeterRow(props: { label: string; count: number; total: number; showShare?: boolean }) {
  const share = () => (props.total ? props.count / props.total : 0);
  return (
    <div class="flex flex-col gap-1.5">
      <div class="flex items-baseline justify-between gap-3 text-sm">
        <span>{props.label}</span>
        <span class="flex items-baseline gap-2">
          <span class="font-semibold tabular-nums">{props.count}</span>
          <Show when={props.showShare}>
            <span class="w-9 text-right font-mono text-xs text-base-content/50">
              {Math.round(share() * 100)}%
            </span>
          </Show>
        </span>
      </div>
      <Meter value={share()} label={props.label} />
    </div>
  );
}

/** The lead card of a page: what is measured, the big number, and one paragraph on what it means. */
export function ScoreCard(
  props: ParentProps<{
    label: string;
    aside?: JSX.Element;
    value: string | number;
    of: string;
    text: JSX.Element;
  }>,
) {
  return (
    <Card label={props.label} aside={props.aside}>
      <div class="flex flex-col gap-3">
        <BigNumber value={props.value} of={props.of} />
        <p class="max-w-xl text-sm text-base-content/70 sm:text-base">{props.text}</p>
      </div>
      {props.children}
    </Card>
  );
}
