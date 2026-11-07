import { For, type ParentProps } from 'solid-js';
import { BrandMark } from '~/components/connect/PublisherLogo';

// Animated feature grid for the landing page. The diagrams are decorative, so they are hidden
// from assistive tech; each cell's title and text carry the meaning.
export function FeatureBento() {
  return (
    <section id="features" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-24">
      <div class="reveal-on-scroll mb-14 flex flex-col items-center gap-4 text-center">
        <span class="badge badge-outline border-base-300 text-base-content/70">Features</span>
        <h2 class="text-4xl font-bold tracking-tight sm:text-6xl">
          Smart <span class="text-base-content/50">Suggestions</span>
        </h2>
        <p class="max-w-xl text-base-content/60">
          An agent that notices what needs attention, explains a fix and lets the owner decide in seconds.
        </p>
      </div>

      <div class="reveal-on-scroll relative">
        <Corners />
        <div class="grid overflow-hidden border border-base-300 bg-base-100 lg:grid-cols-5">
          <Cell
            class="lg:col-span-3 lg:border-r"
            title="One change, every channel"
            text="Approved hours are written to Connect's backend, which publishes them to Google, Apple Maps, Bing and more. The owner is told where they now show."
          >
            <CollaborationDiagram />
          </Cell>
          <Cell
            class="lg:col-span-2"
            title="Explained suggestions"
            text="Every suggestion is one concrete change with the data behind it: last year’s hours, what Google shows now, what similar businesses do, and how sure the AI is."
          >
            <ReportsDiagram />
          </Cell>
          <Cell
            class="lg:col-span-2 lg:border-r"
            title="Approve on WhatsApp"
            text="Owners tap Approve, Edit or No thanks, in Finnish, Swedish, Norwegian or English. One message at a time, most important first."
          >
            <ChatDiagram />
          </Cell>
          <Cell
            class="lg:col-span-3"
            title="Wrong suggestions stay out"
            text="Each suggestion is checked against the owner's own pages. If they disagree it waits for the owner, and nothing is published without approval."
          >
            <AnalyticsDiagram />
          </Cell>
        </div>
      </div>
    </section>
  );
}

function Cell(props: ParentProps<{ class?: string; title: string; text: string }>) {
  return (
    <article class={['group flex flex-col border-base-300 not-last:border-b', props.class]}>
      <div class="relative h-60 overflow-hidden" aria-hidden="true">
        {props.children}
      </div>
      <div class="p-6 pt-2 sm:p-8 sm:pt-2">
        <h3 class="text-lg font-semibold">{props.title}</h3>
        <p class="mt-1 text-base-content/60">{props.text}</p>
      </div>
    </article>
  );
}

/** Viewfinder-style brackets just outside the grid's corners. */
function Corners() {
  const base = 'pointer-events-none absolute size-5 border-base-content/40';
  return (
    <>
      <span class={[base, '-top-3 -left-3 border-t-2 border-l-2']} />
      <span class={[base, '-top-3 -right-3 border-t-2 border-r-2']} />
      <span class={[base, '-bottom-3 -left-3 border-b-2 border-l-2']} />
      <span class={[base, '-right-3 -bottom-3 border-r-2 border-b-2']} />
    </>
  );
}

// Connecta AI in the middle, the channels it publishes to around it, as positions in a 400 x 240 box.
// Yelp starts out of date and turns green when the pulse re-syncs it.
const channels = [
  { name: 'Google', x: 110, y: 58, stale: false },
  { name: 'Facebook', x: 200, y: 30, stale: false },
  { name: 'Apple Maps', x: 290, y: 58, stale: false },
  { name: 'Bing', x: 92, y: 178, stale: false },
  { name: 'Tripadvisor', x: 200, y: 212, stale: false },
  { name: 'Yelp', x: 308, y: 178, stale: true },
];
const HUB = { x: 200, y: 120 };
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

function CollaborationDiagram() {
  return (
    <div class="absolute inset-0 flex items-center justify-center">
      {/* Fixed aspect box, so the SVG lines and the HTML logos line up at any width. */}
      <div class="relative aspect-[5/3] h-full max-w-full">
        <svg viewBox="0 0 400 240" class="absolute inset-0 size-full">
          <For each={channels}>
            {(c, i) => {
              const d = `M${HUB.x},${HUB.y} L${c.x},${c.y}`;
              return (
                <>
                  <path
                    d={d}
                    class="animate-dash stroke-base-content/20"
                    stroke-width="1.5"
                    stroke-dasharray="4 4"
                    fill="none"
                  />
                  {c.stale ? (
                    // One green pulse travels out just before the stale channel turns green.
                    <circle r="3.5" class="fill-success">
                      <animateMotion
                        dur="8s"
                        repeatCount="indefinite"
                        path={d}
                        keyPoints="0;0;1;1"
                        keyTimes="0;0.3;0.48;1"
                        calcMode="linear"
                      />
                      <animate
                        attributeName="opacity"
                        values="0;1;1;0;0"
                        keyTimes="0;0.3;0.47;0.5;1"
                        dur="8s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  ) : (
                    <circle r="2.5" class="fill-base-content/50">
                      <animateMotion dur={`${2.2 + i() * 0.4}s`} repeatCount="indefinite" path={d} />
                    </circle>
                  )}
                </>
              );
            }}
          </For>
        </svg>

        <div
          class="absolute grid size-12 -translate-1/2 place-items-center rounded-xl bg-base-content text-base-100 shadow-sm"
          style={{ left: pct(HUB.x, 400), top: pct(HUB.y, 240) }}
        >
          <LinkIcon />
        </div>

        <For each={channels}>
          {(c) => (
            <div class="absolute -translate-1/2" style={{ left: pct(c.x, 400), top: pct(c.y, 240) }}>
              <div class="grid size-10 place-items-center rounded-full border border-base-300 bg-base-100 shadow-sm">
                <BrandMark name={c.name} class="size-5" />
              </div>
              {c.stale ? (
                <>
                  <span class="absolute -right-0.5 -bottom-0.5 size-3 animate-stale rounded-full border-2 border-base-100 bg-base-content/40" />
                  <span class="absolute -right-0.5 -bottom-0.5 size-3 animate-fresh rounded-full border-2 border-base-100 bg-success" />
                  <span class="absolute top-full left-1/2 mt-1 -translate-x-1/2 animate-stale font-mono text-[10px] whitespace-nowrap text-base-content/50">
                    Out of date
                  </span>
                  <span class="absolute top-full left-1/2 mt-1 -translate-x-1/2 animate-fresh font-mono text-[10px] whitespace-nowrap text-success">
                    Re-synced
                  </span>
                </>
              ) : (
                <span class="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-base-100 bg-success" />
              )}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

function LinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.25"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="size-5"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

// The data behind one suggestion, as in the brief's example: last year, what Google shows now, the peers.
const evidence = [
  { icon: '↺', text: 'Last year: open 10–15' },
  { icon: 'G', text: 'Google shows 9–18 (regular Saturday)' },
  { icon: '≈', text: '8 of 10 cafés nearby shorten hours' },
];

function ReportsDiagram() {
  return (
    <div class="absolute inset-0 flex items-center justify-center">
      <div class="relative h-48 w-72 animate-float">
        <div class="absolute inset-0 translate-x-6 -translate-y-6 rounded-box border border-base-300 bg-base-200/60" />
        <div class="absolute inset-0 translate-x-3 -translate-y-3 rounded-box border border-base-300 bg-base-200/80" />
        <div class="absolute inset-0 flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="font-mono text-[10px] tracking-widest text-base-content/50">SUGGESTION</span>
            <span class="badge badge-xs badge-neutral">High impact</span>
          </div>
          <div class="text-sm font-semibold">Sat 31 Oct · All Saints’ Day → 10–15</div>
          <ul class="flex flex-col gap-1 text-xs text-base-content/70">
            <For each={evidence}>
              {(e, i) => (
                <li
                  class="flex animate-row items-center gap-2"
                  style={{ 'animation-delay': `${i() * 0.45}s` }}
                >
                  <span class="grid size-4 place-items-center rounded bg-base-200 font-mono text-[9px]">
                    {e.icon}
                  </span>
                  {e.text}
                </li>
              )}
            </For>
          </ul>
          <div class="mt-auto flex items-center gap-2">
            <div class="h-1 flex-1 overflow-hidden rounded-full bg-base-200">
              <div class="h-full w-[92%] origin-left animate-fill rounded-full bg-base-content" />
            </div>
            <span class="font-mono text-[10px] text-base-content/60">92% sure</span>
          </div>
          <div class="flex gap-1.5">
            <span class="btn btn-xs btn-neutral">Approve</span>
            <span class="btn btn-ghost btn-xs border-base-300">Edit</span>
            <span class="btn btn-ghost btn-xs">No thanks</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const liveOn = ['Google', 'Apple Maps', 'Bing', 'Facebook', 'Tripadvisor'];

function ChatDiagram() {
  return (
    <div class="absolute inset-0 flex flex-col justify-center gap-1 px-5 text-sm">
      <div class="mb-1 flex items-center gap-2 text-xs text-base-content/60">
        <BrandMark name="WhatsApp" class="size-4" />
        <span class="font-medium text-base-content">Connecta AI</span>
        <span>· WhatsApp</span>
      </div>
      <div class="chat chat-start animate-bubble">
        <div class="chat-bubble bg-base-300 text-[13px]">
          Hi Kahvila Aurora! All Saints’ Day is Sat 31 Oct. Last year you were open 10–15. Suggested: 10–15
          <div class="mt-1.5 flex gap-1">
            <span class="rounded bg-base-100 px-1.5 py-0.5 text-[11px]">Approve</span>
            <span class="rounded bg-base-100 px-1.5 py-0.5 text-[11px]">Edit</span>
            <span class="rounded bg-base-100 px-1.5 py-0.5 text-[11px]">No thanks</span>
          </div>
        </div>
      </div>
      <div class="chat chat-end animate-bubble [animation-delay:1.2s]">
        <div class="chat-bubble chat-bubble-neutral text-[13px]">Kyllä!</div>
      </div>
      <div class="chat chat-start animate-bubble [animation-delay:2.4s]">
        <div class="chat-bubble bg-base-300 text-[13px]">
          Done! Live now on
          <span class="mt-1 flex gap-1.5">
            <For each={liveOn}>{(name) => <BrandMark name={name} class="size-4" />}</For>
          </span>
        </div>
      </div>
    </div>
  );
}

const linePoints = [62, 70, 58, 66, 48, 52, 38, 44, 30, 34, 20];

function AnalyticsDiagram() {
  const step = 400 / (linePoints.length - 1);
  const pts = linePoints.map((y, i) => `${i * step},${y * 2}`);
  const line = `M${pts.join(' L')}`;
  const last = pts.at(-1)!.split(',');

  return (
    <div class="absolute inset-0 flex flex-col gap-3 px-6 pt-6 sm:px-8">
      <div class="flex items-baseline gap-3 font-mono">
        <span class="text-xs tracking-widest text-base-content/50">LISTING HEALTH</span>
        <span class="text-2xl font-semibold">94</span>
        <span class="text-sm text-success">↑ 31</span>
      </div>
      <svg viewBox="0 -10 400 160" class="w-full flex-1 overflow-visible">
        <For each={[30, 70, 110]}>
          {(y) => <line x1="0" x2="400" y1={y} y2={y} class="stroke-base-300" stroke-dasharray="2 4" />}
        </For>
        <path
          d={line}
          pathLength="1"
          stroke-dasharray="1"
          class="animate-draw stroke-primary"
          stroke-width="2"
          fill="none"
          vector-effect="non-scaling-stroke"
        />
        <circle cx={last[0]} cy={last[1]} r="4" class="fill-primary" />
        <circle cx={last[0]} cy={last[1]} r="4" class="fill-none stroke-primary" stroke-width="1.5">
          <animate attributeName="r" values="4;12" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0" dur="2s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
}
