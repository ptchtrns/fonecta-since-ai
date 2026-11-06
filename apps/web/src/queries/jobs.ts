import { query } from '@solidjs/router';
import type { Job } from '~/db/schema';
import { apiGet, type Jsonify } from '~/lib/api';

export type JobItem = Jsonify<Job>;

export const getJobs = query(() => apiGet<JobItem[]>('/api/jobs'), 'jobs');
