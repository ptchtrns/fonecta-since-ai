import { z } from 'zod';

const jobType = z
  .string()
  .regex(/^[a-z0-9_-]{1,64}$/, { message: 'Use lowercase letters, digits, dashes or underscores' });

export const createJobSchema = z.object({
  type: jobType,
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type CreateJobPayload = z.infer<typeof createJobSchema>;

export const claimJobSchema = z.object({
  // Job types the worker can handle. Omit to accept any.
  types: z.array(jobType).max(50).optional(),
});
export type ClaimJobPayload = z.infer<typeof claimJobSchema>;

export const finishJobSchema = z.object({
  status: z.enum(['done', 'failed']),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().max(4000).optional(),
});
export type FinishJobPayload = z.infer<typeof finishJobSchema>;

export const jobParamsSchema = z.object({
  id: z.string().min(1).max(64),
});
