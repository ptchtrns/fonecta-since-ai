import { z } from 'zod';

export const MAX_QUESTION = 300;

export const askSchema = z.object({
  // "owner": the front page's advisor. "customer": the AI tab's "ask like a customer".
  mode: z.enum(['owner', 'customer']),
  question: z
    .string()
    .trim()
    .min(1, { message: 'Type a question' })
    .max(MAX_QUESTION, { message: `Up to ${MAX_QUESTION} characters` }),
  // The conversation so far, so a follow-up refers to the last answer.
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
    .max(12)
    .default([]),
});
export type AskPayload = z.infer<typeof askSchema>;
