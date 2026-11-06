import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { JobsPanel } from '~/components/dashboard/JobsPanel';
import { UploadsPanel } from '~/components/dashboard/UploadsPanel';
import { getJobs } from '~/queries/jobs';
import { getUploads } from '~/queries/uploads';

export const route = {
  preload: () => {
    void getUploads();
    void getJobs();
  },
} satisfies RouteDefinition;

export default function DashboardOverview() {
  return (
    <div class="mx-auto flex max-w-6xl flex-col gap-6">
      <Title>Dashboard</Title>
      <h1 class="text-3xl font-bold">Overview</h1>
      <UploadsPanel />
      <JobsPanel />
    </div>
  );
}
