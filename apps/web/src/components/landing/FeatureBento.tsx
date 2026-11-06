import { For, type ParentProps } from 'solid-js';

// Animated feature grid for the landing page. The diagrams are decorative, so they are hidden
// from assistive tech; each cell's title and text carry the meaning.
export function FeatureBento() {
  return (
    <section id="features" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-24">
      <div class="reveal-on-scroll mb-14 flex flex-col items-center gap-4 text-center">
        <span class="badge badge-outline border-base-300 text-base-content/70">Features</span>
        <h2 class="text-4xl font-bold tracking-tight sm:text-6xl">
          Smart{' '}
          <span class="text-base-content/50">
            Workflow
          </span>
        </h2>
        <p class="max-w-xl text-base-content/60">
          Everything your team needs to collaborate, report and ship, with AI built in.
        </p>
      </div>

      <div class="reveal-on-scroll relative">
        <Corners />
        <div class="grid overflow-hidden border border-base-300 bg-base-100 lg:grid-cols-5">
          <Cell
            class="lg:col-span-3 lg:border-r"
            title="Real-Time Collaboration"
            text="Work together in real time, share updates, track changes, and stay aligned without switching tools."
          >
            <CollaborationDiagram />
          </Cell>
          <Cell
            class="lg:col-span-2"
            title="Automated reports"
            text="Get clean, structured reports generated from your data, with no formatting or manual writing."
          >
            <ReportsDiagram />
          </Cell>
          <Cell
            class="lg:col-span-2 lg:border-r"
            title="AI assistant"
            text="Ask questions in plain language and get answers grounded in your workspace."
          >
            <ChatDiagram />
          </Cell>
          <Cell
            class="lg:col-span-3"
            title="Live analytics"
            text="Watch the numbers that matter update as they happen, from signups to revenue."
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

const people = [
  { x: 110, y: 60, initials: 'AK', online: true },
  { x: 200, y: 32, initials: 'MJ', online: true },
  { x: 292, y: 62, initials: 'SR', online: true },
  { x: 92, y: 172, initials: 'LT', online: true },
  { x: 300, y: 180, initials: 'DN', online: false },
];
const HUB = { x: 200, y: 122 };

function CollaborationDiagram() {
  return (
    <svg viewBox="0 0 400 240" class="absolute inset-0 size-full">
      <For each={people}>
        {(p, i) => {
          const d = `M${HUB.x},${HUB.y} L${p.x},${p.y}`;
          return (
            <>
              <path d={d} class="animate-dash stroke-base-content/25" stroke-width="1.5" stroke-dasharray="4 4" fill="none" />
              <circle r="2.5" class="fill-primary">
                <animateMotion dur={`${2.2 + i() * 0.5}s`} repeatCount="indefinite" path={d} />
              </circle>
            </>
          );
        }}
      </For>

      <rect x={HUB.x - 24} y={HUB.y - 24} width="48" height="48" rx="10" class="fill-base-200 stroke-base-content/30" />
      <text x={HUB.x} y={HUB.y + 7} text-anchor="middle" class="fill-base-content text-xl font-bold">
        H
      </text>

      <For each={people}>
        {(p) => (
          <g>
            <circle cx={p.x} cy={p.y} r="18" class="fill-base-300 stroke-base-content/20" />
            <text x={p.x} y={p.y + 4} text-anchor="middle" class="fill-base-content/80 text-[11px] font-semibold">
              {p.initials}
            </text>
            <circle cx={p.x + 13} cy={p.y + 13} r="4.5" class={p.online ? 'fill-success stroke-base-100' : 'fill-base-content/40 stroke-base-100'} stroke-width="2" />
            {p.online && (
              <circle cx={p.x + 13} cy={p.y + 13} r="4.5" class="fill-none stroke-success" stroke-width="1.5">
                <animate attributeName="r" values="4.5;10" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.8;0" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
          </g>
        )}
      </For>
    </svg>
  );
}

const bars = [45, 70, 35, 85, 60, 95];

function ReportsDiagram() {
  return (
    <div class="absolute inset-0 flex items-center justify-center">
      <div class="relative h-44 w-64 animate-float">
        <div class="absolute inset-0 translate-x-6 -translate-y-6 rounded-box border border-base-300 bg-base-200/60" />
        <div class="absolute inset-0 translate-x-3 -translate-y-3 rounded-box border border-base-300 bg-base-200/80" />
        <div class="absolute inset-0 flex flex-col gap-2 rounded-box border border-base-300 bg-base-200 p-4">
          <span class="font-mono text-xs tracking-widest text-base-content/50">REPORT #143</span>
          <Shimmer class="h-2 w-3/4" />
          <Shimmer class="h-1.5 w-full" />
          <div class="mt-auto flex items-end gap-3">
            <div class="flex h-16 flex-1 items-end gap-1.5">
              <For each={bars}>
                {(h, i) => (
                  <div
                    class="flex-1 origin-bottom animate-bar rounded-t bg-base-content/30 last:bg-primary"
                    style={{ height: `${h}%`, 'animation-delay': `${i() * 0.2}s` }}
                  />
                )}
              </For>
            </div>
            <div class="flex w-14 flex-col gap-1.5 pb-1">
              <Shimmer class="h-1 w-full" />
              <Shimmer class="h-1 w-4/5" />
              <Shimmer class="h-1 w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Shimmer(props: { class: string }) {
  return (
    <div class={['rounded-full bg-base-300', props.class]} />
  );
}

function ChatDiagram() {
  return (
    <div class="absolute inset-0 flex flex-col justify-center gap-1 px-6 text-sm">
      <div class="chat chat-end animate-bubble">
        <div class="chat-bubble chat-bubble-primary">Summarize last week's signups</div>
      </div>
      <div class="chat chat-start animate-bubble [animation-delay:1.2s]">
        <div class="chat-bubble bg-base-300">Signups rose 18%, mostly from the new referral flow.</div>
      </div>
      <div class="chat chat-start animate-bubble [animation-delay:2.4s]">
        <div class="chat-bubble bg-base-300">
          <span class="loading loading-dots loading-sm" />
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
        <span class="text-xs tracking-widest text-base-content/50">REVENUE</span>
        <span class="text-2xl font-semibold">$48.2k</span>
        <span class="text-sm text-success">↑ 12%</span>
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
