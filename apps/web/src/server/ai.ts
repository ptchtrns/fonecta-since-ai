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
};
const config = () => env as AiEnv;

const MODELS = {
  write: () => config().AI_MODEL_WRITE || 'moonshotai/Kimi-K2-Instruct-0905',
  reason: () => config().AI_MODEL_REASON || 'openai/gpt-oss-120b',
};
type Role = keyof typeof MODELS;

export const aiEnabled = () => !!config().FEATHERLESS_API_KEY;

/** The model tried first for the answers people read. */
export const writingModel = () => MODELS.write();

/** "Kimi K2 Instruct 0905" from "moonshotai/Kimi-K2-Instruct-0905", for the UI's "answered by". */
export const modelLabel = (model: string) => (model.split('/').pop() ?? model).replaceAll('-', ' ');

export type Turn = { role: 'user' | 'assistant'; content: string };
export type Completion = { text: string; model: string };

const TIMEOUT_MS = 30_000;

async function complete(
  model: string,
  system: string,
  messages: Turn[],
  { json, maxTokens }: { json: boolean; maxTokens: number },
): Promise<string | null> {
  const { FEATHERLESS_API_KEY, FEATHERLESS_BASE_URL = 'https://api.featherless.ai/v1' } = config();
  if (!FEATHERLESS_API_KEY) return null;
  const start = Date.now();
  const response = await fetch(`${FEATHERLESS_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FEATHERLESS_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: json ? 0.1 : 0.4,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${model}: HTTP ${response.status}`);
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { total_tokens?: number };
  };
  log.info('ai', 'completion', { model, ms: Date.now() - start, tokens: body.usage?.total_tokens });
  return body.choices?.[0]?.message?.content?.trim() || null;
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
