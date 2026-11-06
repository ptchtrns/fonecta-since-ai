import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { createMemo, For } from 'solid-js';
import type { JobStatus } from '~/db/schema';
import { formatBytes } from '~/lib/format';
import { getJobs } from '~/queries/jobs';
import { getUploads } from '~/queries/uploads';

export const route = {
  preload: () => {
    void getUploads();
    void getJobs();
  },
} satisfies RouteDefinition;

const DAYS = 14;

const statusStyle: Record<JobStatus, { dot: string; label: string }> = {
  done: { dot: 'bg-success', label: 'Done' },
  running: { dot: 'bg-info', label: 'Running' },
  queued: { dot: 'bg-base-content/40', label: 'Queued' },
  failed: { dot: 'bg-error', label: 'Failed' },
};

export default function DashboardAnalytics() {
  const jobs = createMemo(() => getJobs());
  const uploads = createMemo(() => getUploads());

  const finished = createMemo(() => jobs().filter((j) => j.status === 'done' || j.status === 'failed'));
  const successRate = createMemo(() => {
    const total = finished().length;
    return total ? (finished().filter((j) => j.status === 'done').length / total) * 100 : null;
  });
  const storage = createMemo(() => uploads().reduce((sum, u) => sum + u.size, 0));

  const byStatus = createMemo(() =>
    (Object.keys(statusStyle) as JobStatus[]).map((status) => ({
      status,
      count: jobs().filter((j) => j.status === status).length,
    })),
  );

  // Jobs created per day over the last DAYS days, oldest first.
  const perDay = createMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (DAYS - 1));
    const days = Array.from({ length: DAYS }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return { date, count: 0 };
    });
    for (const job of jobs()) {
      const index = Math.floor((new Date(job.createdAt).getTime() - start.getTime()) / 86_400_000);
      if (index >= 0 && index < DAYS) days[index]!.count++;
    }
    return days;
  });
  const maxPerDay = createMemo(() => Math.max(1, ...perDay().map((d) => d.count)));
  const lastWeek = createMemo(() => perDay().slice(-7).reduce((s, d) => s + d.count, 0));
  const weekBefore = createMemo(() => perDay().slice(0, 7).reduce((s, d) => s + d.count, 0));

  return (
    <div class="mx-auto flex max-w-6xl flex-col gap-6">
      <Title>Analytics</Title>
      <h1 class="text-3xl font-bold">Analytics</h1>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Jobs" meta="all time" value={jobs().length.toLocaleString()} />
        <Tile
          label="Success rate"
          meta="finished jobs"
          value={successRate() === null ? '—' : `${successRate()!.toFixed(1)}%`}
        />
        <Tile label="Images" meta="uploaded" value={uploads().length.toLocaleString()} />
        <Tile label="Storage" meta="used" value={formatBytes(storage())} />
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <section class="card card-border border-base-300 bg-base-100 lg:col-span-2">
          <div class="card-body gap-6">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="font-mono text-xs tracking-widest text-base-content/60 uppercase">
                Jobs per day
              </h2>
              <Trend current={lastWeek()} previous={weekBefore()} />
            </div>
            <div class="flex h-40 items-end gap-1.5">
              <For each={perDay()} keyed={false}>
                {(day) => (
                  <div
                    class="tooltip flex h-full flex-1 items-end"
                    data-tip={`${day().date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${day().count}`}
                  >
                    <div
                      class="w-full rounded-t bg-primary/80 transition-colors hover:bg-primary"
                      style={{ height: `${Math.max(2, (day().count / maxPerDay()) * 100)}%` }}
                    />
                  </div>
                )}
              </For>
            </div>
            <div class="flex justify-between font-mono text-xs text-base-content/50">
              <span>{DAYS} days ago</span>
              <span>Today</span>
            </div>
          </div>
        </section>

        <section class="card card-border border-base-300 bg-base-100">
          <div class="card-body gap-4">
            <h2 class="font-mono text-xs tracking-widest text-base-content/60 uppercase">Job status</h2>
            <ul class="flex flex-col gap-3">
              <For each={byStatus()} keyed={(row) => row.status}>
                {(row) => (
                  <li class="flex items-center gap-3 font-mono text-sm">
                    <span class={['size-2 rounded-full', statusStyle[row().status].dot]} />
                    <span class="flex-1">{statusStyle[row().status].label}</span>
                    <span class="text-base-content/70">{row().count}</span>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function Tile(props: { label: string; meta: string; value: string }) {
  return (
    <section class="card card-border border-base-300 bg-base-100">
      <div class="card-body gap-3">
        <div class="flex items-baseline justify-between font-mono text-xs tracking-widest uppercase">
          <span class="text-base-content/60">{props.label}</span>
          <span class="text-base-content/40 normal-case">{props.meta}</span>
        </div>
        <span class="font-mono text-3xl font-semibold">{props.value}</span>
      </div>
    </section>
  );
}

/** Week-over-week change, shown with an arrow so the direction never relies on color alone. */
function Trend(props: { current: number; previous: number }) {
  const change = () =>
    props.previous ? ((props.current - props.previous) / props.previous) * 100 : null;
  return (
    <span class="font-mono text-sm text-base-content/60">
      {change() === null ? (
        `${props.current} this week`
      ) : (
        <>
          <span class={change()! >= 0 ? 'text-success' : 'text-error'}>
            {change()! >= 0 ? '↑' : '↓'} {Math.abs(change()!).toFixed(0)}%
          </span>{' '}
          vs last week
        </>
      )}
    </span>
  );
}
