import { z } from 'zod';

export const MAX_COPILOT_MESSAGE = 1_000;

const id = z.uuid();
// Made by the browser (crypto.randomUUID), so a retried request is recognised.
const clientKey = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export const copilotSelectionSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('suggestion'),
      key: z.string().regex(/^(\d{4}-\d{2}-\d{2}|closed-for-good)$/),
    }),
    z.object({ type: z.literal('google_edit'), id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }),
  ])
  .nullable();

export const copilotSendSchema = z.object({
  // Absent for the first message: the server starts a conversation.
  conversationId: id.nullish(),
  clientMessageId: clientKey,
  message: z
    .string()
    .trim()
    .min(1, { message: 'Type a message' })
    .max(MAX_COPILOT_MESSAGE, { message: `Up to ${MAX_COPILOT_MESSAGE} characters` }),
  // Where the owner is. Only the path is used, and only if it's one of the dashboard's pages.
  page: z
    .object({
      route: z.string().max(200).default('/dashboard'),
      tab: z.string().max(20).nullish(),
      selection: copilotSelectionSchema.optional().default(null),
    })
    .default({ route: '/dashboard', selection: null }),
});
export type CopilotSendPayload = z.infer<typeof copilotSendSchema>;

export const copilotConfirmSchema = z.object({ idempotencyKey: clientKey });
export const copilotIdSchema = z.object({ id });
