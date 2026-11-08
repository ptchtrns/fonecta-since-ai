import 'server-only';
import { and, asc, count, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import {
  copilotAudit,
  copilotConversation,
  copilotMessage,
  copilotPreview,
  copilotToolCall,
  type CopilotAuditEvent,
  type CopilotMessageRole,
  type CopilotMessageStatus,
  type CopilotToolCallStatus,
} from '~/db/schema';
import {
  operationTitles,
  type ConversationView,
  type MessageView,
  type PreviewView,
} from '~/lib/copilot/types';
import { db } from '~/server/db';
import { log } from '~/server/log';

// The copilot's records in D1. Every read takes the owner (user and business) from the caller, which takes them from
// the session, and filters on both, so one account never sees another's conversations.

/** Conversations, their messages, tool calls and previews are deleted this long after the last message. */
export const COPILOT_RETENTION_DAYS = 30;
/** Audit rows hold no message text and are kept longer, for who-changed-what questions. */
export const AUDIT_RETENTION_DAYS = 365;
/** A turn still "pending" after this long was cut off (the Worker was stopped) and is marked failed. */
const PENDING_TURN_MS = 2 * 60_000;
export const RATE_LIMIT = { perMinute: 8, perDay: 150 };

export type Owner = { userId: string; entityId: string };
type Ids = { conversationId?: string | null; previewId?: string | null };

const DAY_MS = 86_400_000;

/** Appends an audit row. Never fails the request: a lost audit row is logged instead. */
export async function audit(
  owner: Owner,
  event: CopilotAuditEvent,
  detail: Record<string, unknown>,
  ids: Ids = {},
) {
  try {
    await db.insert(copilotAudit).values({
      id: crypto.randomUUID(),
      userId: owner.userId,
      entityId: owner.entityId,
      conversationId: ids.conversationId ?? null,
      previewId: ids.previewId ?? null,
      event,
      detail,
    });
  } catch (error) {
    log.error('copilot', 'audit write failed', { event, error });
  }
  log.info('copilot', event, { entity: owner.entityId, ...ids, ...detail });
}

/** Whether this account may send another message now, counted from the audit log. */
export async function withinRateLimit(userId: string, now = Date.now()) {
  const since = (ms: number) =>
    db
      .select({ n: count() })
      .from(copilotAudit)
      .where(
        and(
          eq(copilotAudit.userId, userId),
          eq(copilotAudit.event, 'message_received'),
          gt(copilotAudit.createdAt, new Date(now - ms)),
        ),
      );
  const [[minute], [day]] = await Promise.all([since(60_000), since(DAY_MS)]);
  return (minute?.n ?? 0) < RATE_LIMIT.perMinute && (day?.n ?? 0) < RATE_LIMIT.perDay;
}

export async function findConversation(owner: Owner, id: string) {
  const [row] = await db
    .select()
    .from(copilotConversation)
    .where(
      and(
        eq(copilotConversation.id, id),
        eq(copilotConversation.userId, owner.userId),
        eq(copilotConversation.entityId, owner.entityId),
      ),
    );
  return row ?? null;
}
export type Conversation = NonNullable<Awaited<ReturnType<typeof findConversation>>>;

export async function latestConversation(owner: Owner) {
  const [row] = await db
    .select()
    .from(copilotConversation)
    .where(
      and(
        eq(copilotConversation.userId, owner.userId),
        eq(copilotConversation.entityId, owner.entityId),
        eq(copilotConversation.status, 'open'),
      ),
    )
    .orderBy(desc(copilotConversation.lastMessageAt))
    .limit(1);
  return row ?? null;
}

export async function createConversation(owner: Owner, title: string) {
  const [row] = await db
    .insert(copilotConversation)
    .values({ id: crypto.randomUUID(), ...owner, title, lastMessageAt: new Date() })
    .returning();
  return row!;
}

/** The next message number. One statement, so two requests can't get the same one. */
async function nextSeq(conversationId: string) {
  const [row] = await db
    .update(copilotConversation)
    .set({ lastSeq: sql`${copilotConversation.lastSeq} + 1`, lastMessageAt: new Date() })
    .where(eq(copilotConversation.id, conversationId))
    .returning({ seq: copilotConversation.lastSeq });
  return row!.seq;
}

export type NewMessage = {
  role: CopilotMessageRole;
  content: string;
  status?: CopilotMessageStatus;
  clientMessageId?: string | null;
  route?: string | null;
};

export async function addMessage(conversationId: string, message: NewMessage) {
  const seq = await nextSeq(conversationId);
  const [row] = await db
    .insert(copilotMessage)
    .values({ id: crypto.randomUUID(), conversationId, seq, status: 'complete', ...message })
    .returning();
  return row!;
}
export type Message = Awaited<ReturnType<typeof addMessage>>;

export async function updateMessage(
  id: string,
  fields: Partial<Omit<Message, 'id' | 'conversationId' | 'seq'>>,
) {
  await db.update(copilotMessage).set(fields).where(eq(copilotMessage.id, id));
}

/** Settles a pending answer. False when it was no longer pending (the owner pressed Stop meanwhile). */
export async function finishMessage(
  id: string,
  fields: Partial<Omit<Message, 'id' | 'conversationId' | 'seq'>>,
) {
  const rows = await db
    .update(copilotMessage)
    .set(fields)
    .where(and(eq(copilotMessage.id, id), eq(copilotMessage.status, 'pending')))
    .returning({ id: copilotMessage.id });
  return rows.length > 0;
}

export async function findMessage(id: string) {
  const [row] = await db.select().from(copilotMessage).where(eq(copilotMessage.id, id));
  return row ?? null;
}

export async function messageStatus(id: string) {
  const [row] = await db
    .select({ status: copilotMessage.status })
    .from(copilotMessage)
    .where(eq(copilotMessage.id, id));
  return row?.status ?? null;
}

export async function findByClientId(conversationId: string, clientMessageId: string) {
  const [row] = await db
    .select()
    .from(copilotMessage)
    .where(
      and(
        eq(copilotMessage.conversationId, conversationId),
        eq(copilotMessage.clientMessageId, clientMessageId),
      ),
    );
  return row ?? null;
}

/** The answer being worked on in this conversation, if any. One that has hung for too long is marked failed. */
export async function pendingTurn(conversationId: string, now = Date.now()) {
  const rows = await db
    .select()
    .from(copilotMessage)
    .where(and(eq(copilotMessage.conversationId, conversationId), eq(copilotMessage.status, 'pending')));
  const hung = rows.filter((m) => now - m.createdAt.getTime() > PENDING_TURN_MS);
  if (hung.length)
    await db
      .update(copilotMessage)
      .set({ status: 'failed', errorCode: 'Interrupted', content: 'This answer was interrupted.' })
      .where(
        inArray(
          copilotMessage.id,
          hung.map((m) => m.id),
        ),
      );
  return rows.find((m) => !hung.includes(m)) ?? null;
}

export async function recordToolCall(call: {
  conversationId: string;
  messageId: string;
  tool: string;
  arguments: Record<string, unknown>;
  status: CopilotToolCallStatus;
  resultSummary?: string;
  errorCode?: string | null;
  durationMs: number;
}) {
  await db.insert(copilotToolCall).values({ id: crypto.randomUUID(), ...call });
}

/** Messages in order, from `afterSeq` on. */
export function listMessages(conversationId: string, afterSeq = 0) {
  return db
    .select()
    .from(copilotMessage)
    .where(and(eq(copilotMessage.conversationId, conversationId), gt(copilotMessage.seq, afterSeq)))
    .orderBy(asc(copilotMessage.seq));
}

export function previewView(row: typeof copilotPreview.$inferSelect): PreviewView {
  return {
    id: row.id,
    operation: row.operation,
    title: operationTitles[row.operation] ?? 'Change',
    diff: row.diff,
    effects: row.effects,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    resultMessage: row.resultMessage,
  };
}

const MAX_VIEW_MESSAGES = 60;

/** The conversation as the panel shows it: messages with their previews. */
export async function conversationView(conversation: Conversation): Promise<ConversationView> {
  const [messages, previews] = await Promise.all([
    listMessages(conversation.id, Math.max(0, conversation.lastSeq - MAX_VIEW_MESSAGES)),
    db.select().from(copilotPreview).where(eq(copilotPreview.conversationId, conversation.id)),
  ]);
  return {
    id: conversation.id,
    title: conversation.title,
    messages: messages.map((m): MessageView =>
      messageView(
        m,
        previews.filter((p) => p.messageId === m.id),
      ),
    ),
  };
}

export const messageView = (
  m: Message,
  previews: (typeof copilotPreview.$inferSelect)[] = [],
): MessageView => ({
  id: m.id,
  seq: m.seq,
  role: m.role,
  content: m.content,
  status: m.status,
  model: m.model,
  createdAt: m.createdAt.toISOString(),
  previews: previews.map(previewView),
});

export async function saveSummary(conversationId: string, summary: string, through: number) {
  await db
    .update(copilotConversation)
    .set({ summary, summaryThrough: through })
    .where(eq(copilotConversation.id, conversationId));
}

/** The owner's "delete this conversation". Its messages, tool calls and previews go with it; the audit stays. */
export async function deleteConversation(owner: Owner, id: string) {
  const conversation = await findConversation(owner, id);
  if (!conversation) return false;
  await db.delete(copilotConversation).where(eq(copilotConversation.id, id));
  await audit(owner, 'conversation_deleted', { messages: conversation.lastSeq }, { conversationId: id });
  return true;
}

/** Hourly, from the cron: expires old previews, and deletes conversations and audit rows past retention. */
export async function purgeCopilot(now = Date.now()) {
  await db
    .update(copilotPreview)
    .set({ status: 'expired' })
    .where(and(eq(copilotPreview.status, 'pending'), lt(copilotPreview.expiresAt, new Date(now))));
  await db
    .delete(copilotConversation)
    .where(lt(copilotConversation.lastMessageAt, new Date(now - COPILOT_RETENTION_DAYS * DAY_MS)));
  await db
    .delete(copilotAudit)
    .where(lt(copilotAudit.createdAt, new Date(now - AUDIT_RETENTION_DAYS * DAY_MS)));
}
