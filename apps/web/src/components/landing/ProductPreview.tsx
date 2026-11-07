import { For, type ParentProps } from 'solid-js';
import { ConnectLogo } from '~/components/connect/ConnectLogo';
import { BrandMark } from '~/components/connect/PublisherLogo';

// Mock of the real owner dashboard for the hero, with the same suggestion arriving on the owner's phone.
// One 10s loop (see the hero-* keyframes in app.css): the WhatsApp message arrives, the owner replies "Kyllä",
// it's published, and the dashboard card flips from Waiting to Published. Decorative, so hidden from
// assistive tech.

const nav = [
  { label: 'Front page', icon: HomeIcon, count: '3', active: true },
  { label: 'Integrations', icon: PlugIcon },
];

const live = ['Google', 'Apple Maps', 'Bing', 'Facebook', 'Tripadvisor'];

export function ProductPreview() {
  return (
    <div class="relative mx-auto w-full max-w-6xl" aria-hidden="true">
      <div class="rounded-t-[1.75rem] border border-b-0 border-base-content/25 border-t-base-content/60 bg-base-200 px-2 pt-2 mask-[linear-gradient(to_bottom,black_60%,transparent)] sm:px-3 sm:pt-3">
        <div class="flex h-[26rem] overflow-hidden rounded-t-[1.25rem] bg-base-100 text-left sm:h-[28rem]">
          {/* Sidebar, as in the dashboard */}
          <div class="hidden w-56 shrink-0 flex-col border-r border-base-300 md:flex">
            <div class="flex h-16 items-center px-4">
              <ConnectLogo />
            </div>
            <div class="flex flex-col gap-0.5 px-2">
              <For each={nav}>
                {(item) => (
                  <div
                    class={[
                      'flex items-center gap-3 rounded-field px-3 py-2 text-sm',
                      item.active ? 'bg-base-200 font-medium' : 'text-base-content/70',
                    ]}
                  >
                    <item.icon />
                    <span class="flex-1 truncate">{item.label}</span>
                    {item.count && <span class="badge badge-ghost badge-sm tabular-nums">{item.count}</span>}
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* Front page: suggestions, with the business card left of them on wide screens */}
          <div class="flex min-w-0 flex-1 flex-col gap-4 p-5 sm:p-6">
            <div class="flex items-baseline justify-between gap-3">
              <div class="text-sm font-semibold">Suggestions</div>
              <div class="text-xs text-base-content/50">3 waiting, most important first</div>
            </div>

            <div class="flex flex-col gap-3 rounded-box border border-base-300 p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-sm font-semibold">Confirm your All Saints’ Day hours</div>
                  <div class="text-xs text-base-content/60">Sat 31 Oct</div>
                </div>
                {/* Waiting until the owner replies on the phone, then Published. */}
                <span class="relative shrink-0">
                  <span class="badge animate-hero-waiting badge-neutral badge-sm">High</span>
                  <span class="absolute inset-y-0 right-0 badge animate-hero-done badge-sm whitespace-nowrap badge-neutral">
                    ✓ Published
                  </span>
                </span>
              </div>
              <div class="flex items-baseline gap-2 rounded-box bg-base-200 px-3 py-2 tabular-nums">
                <span class="text-xs text-base-content/60">We suggest</span>
                <span class="font-semibold">10:00–15:00</span>
                <span class="text-xs text-base-content/50">· Google shows 09:00–18:00</span>
              </div>
              <p class="text-xs">
                <strong>~40 people</strong> are expected to look you up that day. Keep your hours right so
                nobody makes a wasted trip.
              </p>
              <div class="flex flex-wrap gap-2">
                <span class="btn btn-sm btn-primary">Confirm 10:00–15:00</span>
                <span class="btn btn-ghost btn-sm border-base-300">Different hours (edit)</span>
                <span class="btn btn-ghost btn-sm">Dismiss</span>
              </div>
              <div class="text-xs text-base-content/50">▸ Why we suggest this</div>
            </div>

            <div class="flex items-center gap-2 text-xs text-base-content/50">
              <span>Publishes to</span>
              <For each={live}>{(name) => <BrandMark name={name} class="size-4" />}</For>
              <span>and more</span>
            </div>
          </div>

          {/* The owner's phone */}
          <div class="hidden w-72 shrink-0 items-start justify-center border-l border-base-300 bg-base-200/60 px-5 pt-5 lg:flex">
            <Phone>
              <div class="flex items-center gap-2 bg-[#075e54] px-3 pt-9 pb-2.5 text-white">
                <span class="grid size-7 place-items-center rounded-full bg-white/15">
                  <LinkIcon />
                </span>
                <span class="flex-1 leading-tight">
                  <span class="block text-xs font-semibold">Connecta AI</span>
                  <span class="block text-[10px] text-white/70">WhatsApp Business</span>
                </span>
              </div>
              <div class="flex flex-1 flex-col gap-2 p-2.5 text-[11px] leading-snug text-[#111b21]">
                <Bubble class="animate-hero-msg">
                  Hi Mika! <b>Confirm your All Saints’ Day hours (Sat 31.10.)</b>
                  <br />
                  We suggest: <b>10–15</b>. Google now shows 9–18.
                  <br />
                  About 40 people are expected to look you up that day.
                  <span class="mt-1.5 grid grid-cols-3 gap-1 border-t border-black/10 pt-1.5 text-center font-medium text-[#027eb5]">
                    <span>Confirm hours</span>
                    <span>Edit hours</span>
                    <span>Dismiss</span>
                  </span>
                </Bubble>
                <Bubble class="animate-hero-reply self-end bg-[#d9fdd3]">Kyllä 👍</Bubble>
                <Bubble class="animate-hero-done">
                  ✅ Done! Live now on
                  <span class="mt-1 flex gap-1">
                    <For each={live}>{(name) => <BrandMark name={name} class="size-3.5" />}</For>
                  </span>
                </Bubble>
              </div>
            </Phone>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A modern phone drawn in CSS: purple metal rim, black bezel, Dynamic Island with its camera, side buttons, and a
 * status bar over whatever screen it holds.
 */
function Phone(props: ParentProps) {
  const button = 'absolute w-[3px] rounded-sm bg-[#5e4a66]';
  return (
    <div class="relative aspect-[744/1412] w-[13.5rem] shrink-0">
      <span class={[button, '-left-[2px] top-[18%] h-[4%]']} />
      <span class={[button, '-left-[2px] top-[25%] h-[7%]']} />
      <span class={[button, '-left-[2px] top-[34%] h-[7%]']} />
      <span class={[button, '-right-[2px] top-[27%] h-[11%]']} />
      <div class="absolute inset-0 rounded-[2.4rem] bg-linear-to-br from-[#8a7392] via-[#6b5672] to-[#4f3f56] p-[3px] shadow-lg">
        <div class="size-full rounded-[2.25rem] bg-[#1e1e1e] p-[7px]">
          <div class="relative flex size-full flex-col overflow-hidden rounded-[1.8rem] bg-[#efeae2]">
            <div class="absolute inset-x-0 top-0 z-10 flex h-8 items-center justify-between px-5 text-[10px] font-semibold text-white">
              <span>9:41</span>
              <span class="flex items-center gap-1">
                <span class="flex items-end gap-px">
                  <span class="h-1 w-0.5 rounded-sm bg-white" />
                  <span class="h-1.5 w-0.5 rounded-sm bg-white" />
                  <span class="h-2 w-0.5 rounded-sm bg-white" />
                </span>
                <span class="h-2 w-4 rounded-[3px] border border-white/80 p-px">
                  <span class="block h-full w-3/4 rounded-[1px] bg-white" />
                </span>
              </span>
            </div>
            <div class="absolute top-2 left-1/2 z-20 flex h-[1.15rem] w-[4.5rem] -translate-x-1/2 items-center justify-end rounded-full bg-black pr-1.5">
              <span class="size-[7px] rounded-full bg-[#1a2340] ring-1 ring-[#2c3b66]" />
            </div>
            {props.children}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble(props: ParentProps<{ class?: string }>) {
  return (
    <div class={['max-w-[90%] rounded-lg bg-white px-2.5 py-1.5 shadow-sm', props.class]}>
      {props.children}
    </div>
  );
}

function Icon(props: ParentProps<{ class?: string }>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={['shrink-0 stroke-current', props.class ?? 'size-[1.125rem]']}
    >
      {props.children}
    </svg>
  );
}

function HomeIcon() {
  return (
    <Icon>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" />
    </Icon>
  );
}

function PlugIcon() {
  return (
    <Icon>
      <path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8ZM12 18v4" />
    </Icon>
  );
}

function LinkIcon() {
  return (
    <Icon class="size-3.5">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Icon>
  );
}
