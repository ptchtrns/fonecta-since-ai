import 'server-only';
import { z } from 'zod';
import type { HistoryTurn } from '~/lib/copilot/budget';
import {
  MAX_PROPOSALS_PER_TURN,
  SUMMARY_PROMPT,
  contextMessage,
  systemPrompt,
  toolResultsMessage,
} from '~/lib/copilot/prompt';
import { parseModelTurn, plainReply } from '~/lib/copilot/protocol';
import { cleanText } from '~/lib/copilot/sanitize';
import { CONTEXT_VERSION, type PreviewView } from '~/lib/copilot/types';
import { err, ok } from '~/lib/result';
import type { CopilotSendPayload } from '~/schemas/copilot.schema';
import { aiEnabled, chat, type ChatMessage } from '~/server/ai';
import type { SessionUser } from '~/server/auth';
import {
  buildEnvelope,
  capabilitiesFor,
  loadSnapshot,
  normalizeRoute,
} from '~/services/copilot-context.service';
import { cancelPreviewsOf, createPreview } from '~/services/copilot-previews.service';
import {
  addMessage,
  audit,
  conversationView,
  createConversation,
  findByClientId,
  findConversation,
  finishMessage,
  listMessages,
  messageStatus,
  pendingTurn,
  recordToolCall,
  saveSummary,
  updateMessage,
  withinRateLimit,
  type Conversation,
  type Message,
  type Owner,
} from '~/services/copilot-store.service';
import { authorize, observation, toolsFor, type ToolContext } from '~/services/copilot-tools.service';

// One turn of the copilot: the owner's message in, an answer and any previews out.
//
//   validate → own the conversation → rate limit → store the message → hydrate context (domain services) →
//   budget the envelope → model (Featherless) ⇄ allowlisted read tools → previews for proposals → store the answer.
//
// The model sees the business only through the envelope and read tools, and changes nothing: proposals become
// previews, and only the owner's confirmation (copilot-previews.service) commits one.

const MAX_STEPS = 4;
/** Messages kept word for word; older ones are folded into the conversation's summary. */
const HISTORY_WINDOW = 12;
/** How many messages may pile up outside the window before the summary is brought up to date. */
const SUMMARY_LAG = 8;

const NO_ANSWER = "I couldn't put an answer together. Try asking in another way.";
const PROPOSED = 'I prepared the change below. Nothing is saved until you confirm it.';

export type SendError =
  | { reason: 'NoModel' }
  | { reason: 'NotFound' }
  | { reason: 'Busy' }
  | { reason: 'RateLimited' }
  | { reason: 'NoBusiness' };

const ownerOf = (user: SessionUser): Owner | null =>
  user.entityId ? { userId: user.id, entityId: user.entityId } : null;

/** The turns the model gets: earlier messages after the summary, with confirmed changes as notes. */
async function historyFor(conversation: Conversation, beforeSeq: number): Promise<HistoryTurn[]> {
  const from = Math.max(conversation.summaryThrough, beforeSeq - 1 - HISTORY_WINDOW);
  const rows = await listMessages(conversation.id, from);
  return rows
    .filter((m) => m.seq < beforeSeq && m.status === 'complete' && m.content)
    .map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.role === 'event' ? `[Event] ${m.content}` : m.content,
    }));
}

/** Without a model, or when it fails: the old summary plus each question and event, shortened. */
function compactSummary(previous: string, messages: Message[]) {
  const lines = messages
    .filter((m) => m.role !== 'assistant' && m.status === 'complete')
    .map((m) =>
      m.role === 'user' ? `Owner asked: ${cleanText(m.content, 100)}` : cleanText(m.content, 160),
    );
  return cleanText([previous, ...lines].filter(Boolean).join('\n'), 1_200);
}

/** Folds messages that left the window into the summary, once enough of them have. */
async function updateSummary(conversation: Conversation, latestSeq: number) {
  const through = latestSeq - HISTORY_WINDOW;
  if (through - conversation.summaryThrough < SUMMARY_LAG) return;
  const messages = (await listMessages(conversation.id, conversation.summaryThrough)).filter(
    (m) => m.seq <= through,
  );
  const transcript = messages
    .filter((m) => m.status === 'complete')
    .map((m) => `${m.role}: ${cleanText(m.content, 400)}`)
    .join('\n');
  const result = await chat(
    [
      { role: 'system', content: SUMMARY_PROMPT },
      {
        role: 'user',
        content: `Earlier notes:\n${conversation.summary || '(none)'}\n\nNew messages:\n${transcript}`,
      },
    ],
    { maxTokens: 500 },
  );
  const parsed = z.object({ summary: z.string().min(1).max(2_000) }).safeParse(
    (() => {
      try {
        const text = result?.text ?? '';
        return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      } catch {
        return null;
      }
    })(),
  );
  const summary = parsed.success
    ? cleanText(parsed.data.summary, 1_200)
    : compactSummary(conversation.summary, messages);
  await saveSummary(conversation.id, summary, through);
}

export async function sendMessage(
  user: SessionUser,
  input: CopilotSendPayload,
  origin: string,
  signal?: AbortSignal,
) {
  const owner = ownerOf(user);
  if (!owner) return err<SendError>({ reason: 'NoBusiness' });
  if (!aiEnabled()) return err<SendError>({ reason: 'NoModel' });

  let conversation = input.conversationId ? await findConversation(owner, input.conversationId) : null;
  if (input.conversationId && !conversation) return err<SendError>({ reason: 'NotFound' });
  if (conversation) {
    // The same message again (a retried request): the answer it already got, or "still working on it".
    if (await findByClientId(conversation.id, input.clientMessageId))
      return ok({ conversation: await conversationView(conversation), replayed: true });
    if (await pendingTurn(conversation.id)) return err<SendError>({ reason: 'Busy' });
  }
  if (!(await withinRateLimit(user.id))) {
    await audit(owner, 'rate_limited', {}, { conversationId: conversation?.id });
    return err<SendError>({ reason: 'RateLimited' });
  }
  conversation ??= await createConversation(owner, cleanText(input.message, 60));

  const route = normalizeRoute(input.page.route);
  const question = await addMessage(conversation.id, {
    role: 'user',
    content: input.message,
    clientMessageId: input.clientMessageId,
    route,
  });
  await audit(
    owner,
    'message_received',
    { chars: input.message.length, route },
    { conversationId: conversation.id },
  );
  const answer = await addMessage(conversation.id, {
    role: 'assistant',
    content: '',
    status: 'pending',
    clientMessageId: `${input.clientMessageId}:reply`,
  });

  try {
    await runTurn({ user, owner, origin, signal, conversation, question, answer, input, route });
  } catch (error) {
    await finishMessage(answer.id, { status: 'failed', errorCode: 'Unexpected', content: NO_ANSWER });
    await audit(owner, 'answer_failed', { code: 'Unexpected' }, { conversationId: conversation.id });
    throw error;
  }
  try {
    await updateSummary(conversation, answer.seq);
  } catch {
    // The summary catches up on a later turn.
  }
  const fresh = (await findConversation(owner, conversation.id)) ?? conversation;
  return ok({ conversation: await conversationView(fresh), replayed: false });
}

type Turn = {
  user: SessionUser;
  owner: Owner;
  origin: string;
  signal?: AbortSignal;
  conversation: Conversation;
  question: Message;
  answer: Message;
  input: CopilotSendPayload;
  route: ReturnType<typeof normalizeRoute>;
};

async function runTurn(turn: Turn) {
  const { owner, conversation, answer, input } = turn;
  const ids = { conversationId: conversation.id };
  const stopped = async () => turn.signal?.aborted || (await messageStatus(answer.id)) === 'cancelled';

  const snapshot = await loadSnapshot(owner);
  if (!snapshot) {
    await finishMessage(answer.id, {
      status: 'failed',
      errorCode: 'NotFound',
      content: 'Your business was not found.',
    });
    return;
  }
  const capabilities = capabilitiesFor(turn.user, owner.entityId);
  const tools = toolsFor(capabilities);
  const ctx: ToolContext = { owner, capabilities, origin: turn.origin, snapshot };

  const { envelope, hash, flags } = await buildEnvelope({
    snapshot,
    capabilities,
    allowedTools: tools.filter((t) => t.kind === 'propose').map((t) => t.name),
    route: turn.route,
    tab: input.page.tab ?? null,
    selection: input.page.selection,
    summary: conversation.summary,
    history: await historyFor(conversation, turn.question.seq),
    request: input.message,
  });
  if (flags.length) await audit(owner, 'untrusted_content', { fields: flags.slice(0, 10) }, ids);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(tools) },
    { role: 'user', content: contextMessage(envelope) },
  ];
  const previews: PreviewView[] = [];
  const usage = { prompt: 0, completion: 0, latency: 0 };
  let model: string | null = null;
  let reply = '';
  let toolCount = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (await stopped()) return cancelled(turn);
    const result = await chat(messages, { signal: turn.signal });
    if (!result) {
      if (await stopped()) return cancelled(turn);
      await finishMessage(answer.id, {
        status: 'failed',
        errorCode: 'ModelFailed',
        content: 'The language model didn’t answer. Try again in a moment.',
      });
      await audit(owner, 'answer_failed', { code: 'ModelFailed', step }, ids);
      return;
    }
    model = result.model;
    usage.prompt += result.promptTokens ?? 0;
    usage.completion += result.completionTokens ?? 0;
    usage.latency += result.latencyMs;

    const parsed = parseModelTurn(result.text);
    for (let i = 0; i < parsed.malformed; i++)
      await recordCall(turn, 'malformed', {}, 'rejected', 'Malformed', '', 0);
    if (!parsed.toolCalls.length || step === MAX_STEPS - 1) {
      reply = parsed.reply;
      break;
    }

    const observations: string[] = [];
    let proposed = false;
    for (const call of parsed.toolCalls) {
      toolCount++;
      const started = Date.now();
      const [denied, allowed] = authorize(call.name, call.arguments, capabilities);
      if (denied) {
        // The model's arguments aren't stored for a refused call: they may be anything.
        await recordCall(turn, call.name, {}, 'rejected', denied.reason, '', 0);
        await audit(owner, 'tool_rejected', { tool: call.name, reason: denied.reason }, ids);
        observations.push(JSON.stringify({ tool: call.name, error: denied.reason, message: denied.message }));
        continue;
      }
      if (allowed.kind === 'read') {
        const result = await allowed.tool.run(ctx, allowed.args);
        const [error, value] = result;
        await recordCall(
          turn,
          call.name,
          allowed.args as Record<string, unknown>,
          error ? 'failed' : 'ok',
          error?.reason ?? null,
          value?.summary ?? '',
          Date.now() - started,
        );
        observations.push(observation(call.name, result));
        continue;
      }
      if (previews.length >= MAX_PROPOSALS_PER_TURN) {
        await recordCall(turn, call.name, allowed.args, 'rejected', 'TooManyProposals', '', 0);
        observations.push(JSON.stringify({ tool: call.name, error: 'TooManyProposals' }));
        continue;
      }
      if (await stopped()) return cancelled(turn);
      const [error, made] = await createPreview(
        ctx,
        { conversationId: conversation.id, messageId: answer.id },
        allowed.tool,
        allowed.args,
      );
      await recordCall(
        turn,
        call.name,
        allowed.args,
        error ? 'failed' : 'ok',
        error?.reason ?? null,
        made ? `preview ${made.preview.id}` : '',
        Date.now() - started,
      );
      if (error) {
        observations.push(JSON.stringify({ tool: call.name, error: error.reason, message: error.message }));
        continue;
      }
      proposed = true;
      previews.push(made.preview);
      observations.push(
        JSON.stringify({
          tool: call.name,
          preview_created: true,
          shown_to_owner: made.preview.diff,
          effects: made.preview.effects,
          note: 'Not saved. The owner confirms or cancels it.',
        }),
      );
    }
    // A reply written together with a proposal is the answer; one written with read calls is just "let me check".
    if (proposed && parsed.reply) {
      reply = parsed.reply;
      break;
    }
    messages.push(
      { role: 'assistant', content: result.text.slice(0, 4_000) },
      { role: 'user', content: toolResultsMessage(observations) },
    );
  }

  if (await stopped()) return cancelled(turn);
  const content = plainReply(reply) || (previews.length ? PROPOSED : NO_ANSWER);
  const settled = await finishMessage(answer.id, {
    status: 'complete',
    content,
    provider: 'featherless',
    model,
    promptTokens: usage.prompt || null,
    completionTokens: usage.completion || null,
    latencyMs: usage.latency,
    contextVersion: CONTEXT_VERSION,
    contextHash: hash,
  });
  if (!settled) return cancelled(turn);
  await audit(
    owner,
    'answer_sent',
    {
      model,
      tools: toolCount,
      previews: previews.length,
      prompt_tokens: usage.prompt,
      completion_tokens: usage.completion,
    },
    ids,
  );
}

async function recordCall(
  turn: Turn,
  tool: string,
  args: Record<string, unknown>,
  status: 'ok' | 'rejected' | 'failed',
  errorCode: string | null,
  resultSummary: string,
  durationMs: number,
) {
  await recordToolCall({
    conversationId: turn.conversation.id,
    messageId: turn.answer.id,
    tool,
    arguments: args,
    status,
    errorCode,
    resultSummary,
    durationMs,
  });
  if (status === 'ok')
    await audit(turn.owner, 'tool_called', { tool }, { conversationId: turn.conversation.id });
}

/** The owner pressed Stop: whatever the turn made is dropped, previews included. */
async function cancelled(turn: Turn) {
  await updateMessage(turn.answer.id, { status: 'cancelled', content: 'Stopped.' });
  await cancelPreviewsOf(turn.answer.id);
  await audit(turn.owner, 'answer_cancelled', {}, { conversationId: turn.conversation.id });
}

/** Stop: marks the answer being worked on as cancelled. The running turn sees it at its next step. */
export async function stopTurn(user: SessionUser, conversationId: string) {
  const owner = ownerOf(user);
  if (!owner) return err({ reason: 'NotFound' as const });
  const conversation = await findConversation(owner, conversationId);
  if (!conversation) return err({ reason: 'NotFound' as const });
  const pending = await pendingTurn(conversation.id);
  if (!pending) return ok({ stopped: false });
  await finishMessage(pending.id, { status: 'cancelled', content: 'Stopped.' });
  await cancelPreviewsOf(pending.id);
  return ok({ stopped: true });
}
