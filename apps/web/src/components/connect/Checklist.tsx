import { For, Show } from 'solid-js';
import type { Check, Fix } from '~/lib/visibility';
import { CheckIcon } from './icons';
import { Eyebrow, type Segment } from './Metrics';

const fixes: Record<Fix, { href: string; label: string }> = {
  company: { href: '/dashboard/company', label: 'Fix in Company information' },
  suggestions: { href: '/dashboard', label: 'See suggestions' },
};

/** A filled circle with a tick when done, an empty one when not. */
export function CheckMark(props: { done: boolean }) {
  return (
    <span
      class={[
        'grid size-[1.125rem] shrink-0 place-items-center rounded-full',
        props.done ? 'bg-base-content text-base-100' : 'border border-base-300',
      ]}
      aria-hidden="true"
    >
      <Show when={props.done}>
        <CheckIcon class="size-3 stroke-3" />
      </Show>
    </span>
  );
}

/** "+25" when the item counts, "0/10" when it's still missing. */
function Points(props: { check: Check }) {
  return (
    <span class="shrink-0 font-mono text-xs text-base-content/40 tabular-nums">
      {props.check.done ? `+${props.check.points}` : `0/${props.check.points}`}
    </span>
  );
}

function FixLink(props: { fix: Fix; size?: 'xs' | 'sm' }) {
  return (
    <a
      href={fixes[props.fix].href}
      class={[
        'btn shrink-0',
        props.size === 'sm' ? 'btn-sm btn-primary' : 'btn-xs btn-ghost border-base-300',
      ]}
    >
      {fixes[props.fix].label}
    </a>
  );
}

/** Each check as one part of a score bar, in the checklist's order. */
export const checkSegments = (checks: Check[]): Segment[] =>
  checks.map((c) => ({ weight: c.points, filled: c.done, label: c.label }));

/** Names and points only, in two columns: for a score's overview. */
export function CompactChecklist(props: { checks: Check[]; points?: boolean; columns?: 1 | 2 }) {
  return (
    <ul class={['grid gap-x-8 gap-y-2.5 text-sm', props.columns === 1 ? '' : 'sm:grid-cols-2']}>
      <For each={props.checks}>
        {(c) => (
          <li class="flex items-center gap-2.5" title={c.detail}>
            <CheckMark done={c.done} />
            <span class={['flex-1', !c.done && 'text-base-content/50']}>
              {c.label}
              <span class="sr-only">{c.done ? ' (done)' : ' (missing)'}</span>
            </span>
            <Show when={props.points}>
              <Points check={c} />
            </Show>
          </li>
        )}
      </For>
    </ul>
  );
}

/**
 * What's missing first, then what's already right, each with a line on why it matters and where to fix it. In a
 * wide card the fix button sits next to the points; in a narrow one, under the text.
 */
export function Checklist(props: { checks: Check[] }) {
  const sorted = () =>
    [...props.checks].sort((a, b) => Number(a.done) - Number(b.done) || b.points - a.points);
  return (
    <ul class="@container flex flex-col divide-y divide-base-300">
      <For each={sorted()}>
        {(c) => (
          <li class="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span class="mt-0.5">
              <CheckMark done={c.done} />
            </span>
            <div class="min-w-0 flex-1">
              <p class={['font-medium', c.done && 'text-base-content/70']}>
                {c.label}
                <span class="sr-only">{c.done ? ' (done)' : ' (missing)'}</span>
              </p>
              <p class="text-sm break-words text-base-content/60">{c.detail}</p>
              <Show when={!c.done && c.fix}>
                {(fix) => (
                  <div class="mt-2 @xl:hidden">
                    <FixLink fix={fix()} />
                  </div>
                )}
              </Show>
            </div>
            <div class="flex shrink-0 items-center gap-3">
              <Show when={!c.done && c.fix}>
                {(fix) => (
                  <span class="hidden @xl:inline-flex">
                    <FixLink fix={fix()} />
                  </span>
                )}
              </Show>
              <Points check={c} />
            </div>
          </li>
        )}
      </For>
    </ul>
  );
}

/** The one thing worth doing next, with a button to where it's done. */
export function NextStep(props: { check: Check }) {
  return (
    <div class="flex flex-wrap items-center gap-4 rounded-box border border-base-300 bg-base-200/50 px-4 py-3">
      <div class="min-w-0 flex-1">
        <Eyebrow>Next best step · +{props.check.points}</Eyebrow>
        <p class="mt-1 font-semibold">{props.check.label}</p>
        <p class="text-sm text-base-content/60">{props.check.detail}</p>
      </div>
      <Show when={props.check.fix}>{(fix) => <FixLink fix={fix()} size="sm" />}</Show>
    </div>
  );
}
