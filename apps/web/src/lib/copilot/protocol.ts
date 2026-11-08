// What the model answers with. Featherless serves many open models and not all of them support OpenAI-style native
// tool calls, so the copilot asks for one JSON object in JSON mode instead, the way the app's other model calls do:
//
//   { "reply": "text for the owner", "tool_calls": [{ "name": "get_suggestion", "arguments": { "key": "..." } }] }
//
// A tool name here is only a request. The server looks it up in its own registry, checks the account may use it,
// validates the arguments with the tool's schema, and runs it for the signed-in account's business only.
import { z } from 'zod';

export const MAX_TOOL_CALLS_PER_STEP = 3;
const MAX_REPLY = 4_000;

const toolCallSchema = z.object({
  name: z.string().regex(/^[a-z][a-z_]{2,48}$/),
  // Some models send the arguments as a JSON string, OpenAI style.
  arguments: z
    .union([z.record(z.string(), z.unknown()), z.string(), z.null()])
    .optional()
    .transform((value): Record<string, unknown> => {
      if (!value) return {};
      if (typeof value !== 'string') return value;
      try {
        const parsed: unknown = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    }),
});

const outputSchema = z.object({
  reply: z.string().max(MAX_REPLY).optional().default(''),
  tool_calls: z.array(z.unknown()).nullish(),
});

export type ToolRequest = z.infer<typeof toolCallSchema>;
export type ModelTurn = {
  reply: string;
  toolCalls: ToolRequest[];
  /** Tool calls that weren't even well formed, or over the limit: recorded as rejected. */
  malformed: number;
  /** The model didn't answer in the protocol, so its text was taken as the reply. */
  fallback: boolean;
};

/** The first JSON object in the text: models sometimes wrap it in a code fence or a sentence. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

export function parseModelTurn(text: string): ModelTurn {
  const parsed = outputSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    // Plain prose is still a usable answer, as long as it isn't a broken attempt at JSON.
    const prose = text.trim();
    const usable = prose && !prose.startsWith('{') && !prose.startsWith('```');
    return { reply: usable ? prose.slice(0, MAX_REPLY) : '', toolCalls: [], malformed: 0, fallback: true };
  }
  const raw = parsed.data.tool_calls ?? [];
  const calls: ToolRequest[] = [];
  let malformed = 0;
  for (const item of raw) {
    const call = toolCallSchema.safeParse(item);
    if (call.success && calls.length < MAX_TOOL_CALLS_PER_STEP) calls.push(call.data);
    else malformed++;
  }
  return { reply: parsed.data.reply.trim(), toolCalls: calls, malformed, fallback: false };
}

/** Markdown the panel would show as symbols: bold, headings and code fences become plain text. */
export const plainReply = (text: string) =>
  text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/```[a-z]*\n?/g, '')
    .trim();
