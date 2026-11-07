import { For, Show } from 'solid-js';
import { fromIntervals, toIntervals, type Interval } from '~/lib/hours';

const DEFAULT_OPEN: Interval = { open: '09:00', close: '17:00' };
// A lunch break makes two intervals. More than three doesn't happen in the data.
const MAX_INTERVALS = 3;

/** One day's hours as text ("closed", "10:00-14:00,17:00-22:00"): an open/closed switch and time inputs. */
export function HoursInput(props: { label: string; value: string; onChange: (hours: string) => void }) {
  const intervals = () => toIntervals(props.value);
  const set = (next: Interval[]) => props.onChange(fromIntervals(next));
  const update = (index: number, patch: Partial<Interval>) =>
    set(intervals().map((interval, i) => (i === index ? { ...interval, ...patch } : interval)));

  return (
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span class="min-w-20 flex-1 text-sm">{props.label}</span>
      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          class="toggle toggle-sm"
          aria-label={`${props.label} open`}
          checked={intervals().length > 0}
          onChange={(e) => set(e.currentTarget.checked ? [DEFAULT_OPEN] : [])}
        />
        <span class="w-12">{intervals().length ? 'Open' : 'Closed'}</span>
      </label>
      <div class="flex flex-col gap-1">
        <For each={intervals()} keyed={false}>
          {(interval, i) => (
            <div class="flex items-center gap-1">
              <input
                type="time"
                class="input input-sm w-28"
                aria-label={`${props.label} opening time`}
                value={interval().open}
                onInput={(e) => e.currentTarget.value && update(i, { open: e.currentTarget.value })}
              />
              <span aria-hidden="true">–</span>
              <input
                type="time"
                class="input input-sm w-28"
                aria-label={`${props.label} closing time`}
                value={interval().close}
                onInput={(e) => e.currentTarget.value && update(i, { close: e.currentTarget.value })}
              />
              <Show
                when={i > 0}
                fallback={
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs btn-square"
                    title="Add a break"
                    aria-label={`Add a break on ${props.label}`}
                    disabled={intervals().length >= MAX_INTERVALS}
                    onClick={() => set([...intervals(), { open: '17:00', close: '22:00' }])}
                  >
                    +
                  </button>
                }
              >
                <button
                  type="button"
                  class="btn btn-ghost btn-xs btn-square"
                  title="Remove"
                  aria-label={`Remove these hours on ${props.label}`}
                  onClick={() => set(intervals().filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
