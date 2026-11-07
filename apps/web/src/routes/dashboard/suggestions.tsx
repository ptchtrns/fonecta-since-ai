import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { createMemo, For, Show } from 'solid-js';
import { getPredictions } from '~/queries/predictions';

export const route = {
  preload: () => void getPredictions(),
} satisfies RouteDefinition;

// Target days that aren't in the holiday calendar, so they have no name of their own.
const OTHER_DAYS: Record<string, string> = { EVENT: 'Local event', SCHOOL_BREAK: 'School break' };

// What apps/predictor decided for the demo businesses. Read-only: sending these to owners comes later.
export default function DashboardSuggestions() {
  const predictions = createMemo(() => getPredictions());
  const flags = createMemo(() => predictions().filter((row) => row.action === 'FLAG').length);

  return (
    <div class="mx-auto flex max-w-6xl flex-col gap-6">
      <Title>Suggestions</Title>
      <div>
        <h1 class="text-3xl font-bold">Suggestions</h1>
        <p class="text-base-content/70">
          {predictions().length - flags()} suggested changes and {flags()} flagged for a person, for the demo
          businesses.
        </p>
      </div>

      <section class="card card-border border-base-300 bg-base-100">
        <div class="card-body">
          <Show
            when={predictions().length > 0}
            fallback={
              <p class="text-base-content/70">
                No predictions yet. Run <code>python3 apps/predictor/run.py --save local</code> from the repo
                root.
              </p>
            }
          >
            <div class="overflow-x-auto">
              <table class="table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Day</th>
                    <th>Google shows</th>
                    <th>Action</th>
                    <th>Suggested</th>
                    <th>Confidence</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={predictions()} keyed={(row) => `${row.entityId}|${row.date}`}>
                    {(row) => (
                      <tr>
                        <td>
                          <div class="font-medium">{row().businessName}</div>
                          <div class="text-sm text-base-content/60">{row().city}</div>
                        </td>
                        <td class="whitespace-nowrap">
                          <div class="font-mono">{row().date}</div>
                          <div class="text-sm text-base-content/60">
                            {row().dayName ?? OTHER_DAYS[row().dayKey] ?? row().dayKey}
                          </div>
                        </td>
                        <td class="font-mono whitespace-nowrap">{row().shownHours}</td>
                        <td>
                          <span class={['badge', row().action === 'FLAG' ? 'badge-warning' : 'badge-ghost']}>
                            {row().action === 'FLAG' ? 'Flag' : 'Suggest'}
                          </span>
                        </td>
                        <td class="font-mono whitespace-nowrap">{row().hours ?? '—'}</td>
                        <td class="font-mono">
                          {row().confidence === null ? '—' : `${Math.round(row().confidence! * 100)}%`}
                        </td>
                        <td class="min-w-64 text-sm">{row().reasons.join('. ')}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </div>
      </section>
    </div>
  );
}
