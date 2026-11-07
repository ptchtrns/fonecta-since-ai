import { z } from 'zod';

// One business's fresh predictions, as apps/worker reports them for a predict-business job.
export const predictBusinessResultSchema = z.object({
  entityId: z.string().min(1).max(64),
  predictions: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        day_key: z.string().min(1).max(64),
        action: z.enum(['SUGGEST', 'FLAG']),
        shown: z.string().max(200),
        hours: z.string().max(200).nullable(),
        confidence: z.number().min(0).max(1).nullable(),
        reasons: z.array(z.string().max(500)).max(20),
      }),
    )
    .max(500),
});
export type PredictBusinessResult = z.infer<typeof predictBusinessResultSchema>;
