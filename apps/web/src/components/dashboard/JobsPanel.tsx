import { revalidate } from '@solidjs/router';
import { createMemo, For, refresh, Show } from 'solid-js';
import { DateTime } from '~/components/DateTime';
import { FormMessage } from '~/components/FormMessage';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { getJobs, type JobItem } from '~/queries/jobs';

const statusBadge: Record<JobItem['status'], string> = {
  queued: 'badge-ghost',
  running: 'badge-info',
  done: 'badge-success',
  failed: 'badge-error',
};

export function JobsPanel() {
  const jobs = createMemo(() => getJobs());
  const form = createFormState();

  function queueEcho() {
    return form.submit(
      async () => {
        const { message } = await apiSend('/api/jobs', 'POST', {
          type: 'echo',
          payload: { message: 'Hello from the dashboard' },
        });
        return message;
      },
      () => {
        revalidate(getJobs.key);
        return refresh(jobs);
      },
    );
  }

  return (
    <section class="card card-border border-base-300 bg-base-100">
      <div class="card-body gap-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="card-title">Jobs</h2>
            <p class="text-base-content/70">Queued here, processed by apps/worker.</p>
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn btn-ghost" onClick={() => revalidate(getJobs.key)}>
              Refresh
            </button>
            <button type="button" class="btn btn-primary" onClick={queueEcho} disabled={form.pending()}>
              Queue echo job
            </button>
          </div>
        </div>

        <FormMessage message={form.message()} />

        <Show when={jobs().length > 0} fallback={<p class="text-base-content/70">No jobs yet.</p>}>
          <div class="overflow-x-auto">
            <table class="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Created</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                <For each={jobs()} keyed={(job) => job.id}>
                  {(job) => (
                    <tr>
                      <td class="font-mono" title={job().id}>
                        {job().id.slice(0, 8)}
                      </td>
                      <td>{job().type}</td>
                      <td>
                        <span class={['badge', statusBadge[job().status]]}>{job().status}</span>
                      </td>
                      <td>{job().attempts}</td>
                      <td class="whitespace-nowrap">
                        <DateTime value={job().createdAt} />
                      </td>
                      <td class="max-w-xs truncate font-mono">
                        {job().error ?? (job().result ? JSON.stringify(job().result) : '')}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>
    </section>
  );
}
