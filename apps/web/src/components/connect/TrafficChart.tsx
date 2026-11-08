import { createSignal, For, Show } from 'solid-js';
import { formatDay } from '~/lib/hours';

type Point = { date: string; views: number };

const WIDTH = 960;
const HEIGHT = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 36 };

/** A round step for the y axis: 1, 2 or 5 times a power of ten. */
function niceMax(max: number) {
  if (max <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 5, 10].find((m) => m * power >= max)!;
  return step * power;
}

/**
 * Daily Google views as one thin line, in ink like the rest of the dashboard. Hovering shows the day and its views;
 * a table with the same numbers is there for screen readers.
 */
export function TrafficChart(props: { points: Point[]; label: string }) {
  const [hover, setHover] = createSignal<number | null>(null);
  const max = () => niceMax(Math.max(...props.points.map((p) => p.views)));
  const x = (i: number) =>
    PAD.left + (i / Math.max(1, props.points.length - 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / max()) * (HEIGHT - PAD.top - PAD.bottom);
  const path = () =>
    props.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.views).toFixed(1)}`).join('');
  // Month starts, for the x axis.
  const ticks = () =>
    props.points.flatMap((p, i) =>
      p.date.endsWith('-01') ? [{ i, label: formatDay(p.date).split(' ').at(-1)! }] : [],
    );

  function onMove(event: PointerEvent) {
    const svg = event.currentTarget as SVGSVGElement;
    const box = svg.getBoundingClientRect();
    const at = ((event.clientX - box.left) / box.width) * WIDTH;
    const share = (at - PAD.left) / (WIDTH - PAD.left - PAD.right);
    const i = Math.round(share * (props.points.length - 1));
    setHover(Math.min(props.points.length - 1, Math.max(0, i)));
  }

  const hovered = () => {
    const i = hover();
    return i === null ? null : { i, ...props.points[i]! };
  };

  return (
    <figure class="relative flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        class="h-auto w-full touch-none text-base-content"
        role="img"
        aria-label={props.label}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <For each={[0, 0.5, 1]}>
          {(share) => (
            <g>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(max() * share)}
                y2={y(max() * share)}
                class="stroke-base-300"
                stroke-width="1"
              />
              <text
                x={PAD.left - 6}
                y={y(max() * share) + 4}
                text-anchor="end"
                class="fill-base-content/50 text-[11px] tabular-nums"
              >
                {Math.round(max() * share)}
              </text>
            </g>
          )}
        </For>
        <For each={ticks()}>
          {(t) => (
            <text x={x(t.i)} y={HEIGHT - 6} text-anchor="middle" class="fill-base-content/50 text-[11px]">
              {t.label}
            </text>
          )}
        </For>
        <path d={path()} fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        <Show when={hovered()}>
          {(h) => (
            <g>
              <line
                x1={x(h().i)}
                x2={x(h().i)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                class="stroke-base-content/30"
                stroke-width="1"
              />
              <circle
                cx={x(h().i)}
                cy={y(h().views)}
                r="4"
                fill="currentColor"
                class="stroke-base-100"
                stroke-width="2"
              />
            </g>
          )}
        </Show>
      </svg>
      <Show when={hovered()}>
        {(h) => (
          <div
            class="pointer-events-none absolute top-0 rounded-box border border-base-300 bg-base-100 px-2 py-1 text-xs shadow-sm"
            style={{
              left: `${(x(h().i) / WIDTH) * 100}%`,
              transform: `translateX(${h().i > props.points.length / 2 ? '-105%' : '5%'})`,
            }}
          >
            <span class="block text-base-content/60">{formatDay(h().date)}</span>
            <span class="font-semibold tabular-nums">{h().views}</span> views
          </div>
        )}
      </Show>
      <table class="sr-only">
        <caption>{props.label}</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Views</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.points}>
            {(p) => (
              <tr>
                <td>{p.date}</td>
                <td>{p.views}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </figure>
  );
}
