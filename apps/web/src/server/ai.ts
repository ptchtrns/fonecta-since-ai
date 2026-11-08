import 'server-only';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { log } from '~/server/log';

// Open models on Featherless (an OpenAI-compatible API), as in the first prototype. Two roles, each falling back to
// the other:
// - write:  Kimi K2, the most natural Finnish and Nordic prose of the models tried.
// - reason: gpt-oss-120b, fast and reliable with JSON.
// Without FEATHERLESS_API_KEY, or when both fail, every function returns null and the caller says so.

type AiEnv = {
  FEATHERLESS_API_KEY?: string;
  FEATHERLESS_BASE_URL?: string;
  AI_MODEL_REASON?: string;
  AI_MODEL_WRITE?: string;
  AI_MODEL_COPILOT?: string;
};
const config = () => env as AiEnv;

const MODELS = {
  write: () => config().AI_MODEL_WRITE || 'moonshotai/Kimi-K2-Instruct-0905',
  reason: () => config().AI_MODEL_REASON || 'openai/gpt-oss-120b',
};
/** The copilot's first choice: an override, or the reasoning model, which keeps to the JSON protocol best. */
const copilotModel = () => config().AI_MODEL_COPILOT || MODELS.reason();
type Role = keyof typeof MODELS;

export const aiEnabled = () => !!config().FEATHERLESS_API_KEY;

/** The model tried first for the answers people read. */
export const writingModel = () => MODELS.write();

/** "Kimi K2 Instruct 0905" from "moonshotai/Kimi-K2-Instruct-0905", for the UI's "answered by". */
export const modelLabel = (model: string) => (model.split('/').pop() ?? model).replaceAll('-', ' ');

export type Turn = { role: 'user' | 'assistant'; content: string };
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type Completion = { text: string; model: string };

const TIMEOUT_MS = 30_000;

type Usage = { promptTokens: number | null; completionTokens: number | null };

async function request(
  model: string,
  messages: ChatMessage[],
  { json, maxTokens, signal }: { json: boolean; maxTokens: number; signal?: AbortSignal },
): Promise<({ text: string } & Usage) | null> {
  const { FEATHERLESS_API_KEY, FEATHERLESS_BASE_URL = 'https://api.featherless.ai/v1' } = config();
  if (!FEATHERLESS_API_KEY) return null;
  const start = Date.now();
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const response = await fetch(`${FEATHERLESS_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FEATHERLESS_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: json ? 0.1 : 0.4,
      max_tokens: maxTokens,
      messages,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  });
  if (!response.ok) throw new Error(`${model}: HTTP ${response.status}`);
  const body = (await response.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
  };
  const finish = body.choices?.[0]?.finish_reason;
  log.info('ai', 'completion', { model, ms: Date.now() - start, tokens: body.usage?.total_tokens, finish });
  const text = body.choices?.[0]?.message?.content?.trim();
  // Cut off at max_tokens: a JSON answer would be broken, so it counts as no answer. Reasoning models spend part of
  // the budget thinking, which is why the copilot's budget is generous.
  if (json && finish === 'length') return null;
  return text
    ? {
        text,
        promptTokens: body.usage?.prompt_tokens ?? null,
        completionTokens: body.usage?.completion_tokens ?? null,
      }
    : null;
}

async function complete(
  model: string,
  system: string,
  messages: Turn[],
  options: { json: boolean; maxTokens: number },
): Promise<string | null> {
  return (await request(model, [{ role: 'system', content: system }, ...messages], options))?.text ?? null;
}

/** Tries the role's model, then the other one. */
async function withFallback<T>(role: Role, run: (model: string) => Promise<T | null>) {
  const order = role === 'write' ? [MODELS.write(), MODELS.reason()] : [MODELS.reason(), MODELS.write()];
  for (const model of order) {
    try {
      const result = await run(model);
      if (result !== null) return { result, model };
      log.warn('ai', 'no usable answer', { role, model });
    } catch (error) {
      log.error('ai', 'request failed', { role, model, error });
    }
  }
  return null;
}

/** Models sometimes wrap JSON in a code fence or add a sentence around it. */
function parseJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** A JSON answer that matches `schema`, with the model that gave it. */
export async function structured<S extends z.ZodType>(
  schema: S,
  system: string,
  prompt: string,
  role: Role = 'reason',
): Promise<{ result: z.infer<S>; model: string } | null> {
  if (!aiEnabled()) return null;
  const shape = JSON.stringify(z.toJSONSchema(schema));
  const instructions = `${system}\n\nAnswer with one JSON object only, matching this JSON Schema:\n${shape}`;
  return withFallback(role, async (model) => {
    const text = await complete(model, instructions, [{ role: 'user', content: prompt }], {
      json: true,
      maxTokens: 1500,
    });
    const parsed = schema.safeParse(text ? parseJson(text) : null);
    return parsed.success ? (parsed.data as z.infer<S>) : null;
  });
}

/** Plain text, for the conversation boxes. Markdown emphasis is removed: the pages show plain text. */
export async function write(system: string, messages: Turn[], maxTokens = 600): Promise<Completion | null> {
  if (!aiEnabled()) return null;
  const found = await withFallback('write', (model) =>
    complete(model, system, messages, { json: false, maxTokens }),
  );
  if (!found) return null;
  const text = found.result
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .trim();
  return text ? { text, model: found.model } : null;
}

export type ChatResult = Usage & { text: string; model: string; provider: 'featherless'; latencyMs: number };

/**
 * One JSON-mode completion for the copilot, with token counts for its records. Tries the copilot's model, then the
 * writing model. Returns null when no model is connected, both fail, or `signal` aborts (the owner pressed Stop).
 */
export async function chat(
  messages: ChatMessage[],
  { signal, maxTokens = 4_000 }: { signal?: AbortSignal; maxTokens?: number } = {},
): Promise<ChatResult | null> {
  if (!aiEnabled()) return null;
  const order = [...new Set([copilotModel(), MODELS.write()])];
  for (const model of order) {
    if (signal?.aborted) return null;
    const start = Date.now();
    try {
      const found = await request(model, messages, { json: true, maxTokens, signal });
      if (found) return { ...found, model, provider: 'featherless', latencyMs: Date.now() - start };
      log.warn('ai', 'no usable answer', { role: 'copilot', model });
    } catch (error) {
      if (signal?.aborted) return null;
      log.error('ai', 'request failed', { role: 'copilot', model, error });
    }
  }
  return null;
}
