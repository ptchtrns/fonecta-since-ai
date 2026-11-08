import 'server-only';
import { and, eq } from 'drizzle-orm';
import { copilotPreview } from '~/db/schema';
import { hashValues } from '~/lib/copilot/diff';
import { operationTitles, type Capability, type PreviewView } from '~/lib/copilot/types';
import { err, ok } from '~/lib/result';
import { db } from '~/server/db';
import { log } from '~/server/log';
import { loadSnapshot } from '~/services/copilot-context.service';
import { addMessage, audit, previewView, type Owner } from '~/services/copilot-store.service';
import { findProposeTool, type ProposeTool, type ToolContext } from '~/services/copilot-tools.service';

// Previews and commits. A preview records what a propose tool would change and the values it starts from; it has no
// effect of its own. Confirming it is the only way the copilot changes anything, and every confirmation:
//   1. finds the preview by id AND the session's user and business (someone else's id is "not found"),
//   2. claims it with a compare-and-set from pending to confirmed, so two clicks or two tabs commit once,
//   3. checks the account still has the tool's capability, and validates the stored payload again,
//   4. reads the business afresh and compares the starting values' hash, refusing if anything changed since,
//   5. calls the domain service the dashboard itself uses, and records the outcome.
// The same idempotency key again returns the recorded outcome instead of committing twice.

export const PREVIEW_TTL_MS = 15 * 60_000;

type Row = typeof copilotPreview.$inferSelect;

/** A target a newer preview replaces: the same operation on the same suggestion or edit. */
const targetOf = (operation: string, payload: Record<string, unknown>) =>
  `${operation}:${String(payload.key ?? payload.id ?? '')}`;

async function hashBase(
  tool: ProposeTool,
  ctx: Pick<ToolContext, 'snapshot'>,
  payload: Record<string, unknown>,
) {
  return hashValues({ operation: tool.name, base: tool.base(ctx.snapshot, payload) });
}

/** Runs a propose tool and stores its preview. Earlier pending previews for the same target are cancelled. */
export async function createPreview(
  ctx: ToolContext,
  ids: { conversationId: string; messageId: string },
  tool: ProposeTool,
  args: Record<string, unknown>,
) {
  const [error, proposal] = await tool.prepare(ctx, args);
  if (error) return err(error);
  // The stored payload is what gets committed, so it must pass the schema on its own.
  const payload = tool.schema.safeParse(proposal.payload);
  if (!payload.success)
    return err({ reason: 'InvalidArguments', message: 'The change could not be prepared.' });

  const pending = await db
    .select({ id: copilotPreview.id, operation: copilotPreview.operation, payload: copilotPreview.payload })
    .from(copilotPreview)
    .where(and(eq(copilotPreview.conversationId, ids.conversationId), eq(copilotPreview.status, 'pending')));
  const target = targetOf(tool.name, proposal.payload);
  for (const old of pending.filter((p) => targetOf(p.operation, p.payload) === target)) {
    await db
      .update(copilotPreview)
      .set({ status: 'cancelled', errorCode: 'Superseded' })
      .where(and(eq(copilotPreview.id, old.id), eq(copilotPreview.status, 'pending')));
  }

  const [row] = await db
    .insert(copilotPreview)
    .values({
      id: crypto.randomUUID(),
      ...ids,
      userId: ctx.owner.userId,
      entityId: ctx.owner.entityId,
      operation: tool.name,
      payload: proposal.payload,
      diff: proposal.diff,
      effects: proposal.effects,
      baseHash: await hashBase(tool, ctx, proposal.payload),
      expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
    })
    .returning();
  await audit(
    ctx.owner,
    'preview_created',
    { operation: tool.name, fields: proposal.diff.map((d) => d.field) },
    { conversationId: ids.conversationId, previewId: row!.id },
  );
  return ok({ preview: previewView(row!), proposal });
}

async function findOwned(owner: Owner, id: string) {
  const [row] = await db
    .select()
    .from(copilotPreview)
    .where(
      and(
        eq(copilotPreview.id, id),
        eq(copilotPreview.userId, owner.userId),
        eq(copilotPreview.entityId, owner.entityId),
      ),
    );
  return row ?? null;
}

async function settle(row: Row, fields: Partial<Row>) {
  const [updated] = await db
    .update(copilotPreview)
    .set(fields)
    .where(eq(copilotPreview.id, row.id))
    .returning();
  return updated!;
}

export type ConfirmError =
  | { reason: 'NotFound' }
  | { reason: 'Closed'; status: Row['status'] }
  | { reason: 'InProgress' }
  | { reason: 'NotAllowed' }
  | { reason: 'Stale'; preview: PreviewView }
  | { reason: 'Failed'; message: string; preview: PreviewView };

/** What a repeated confirmation with the same key gets: the outcome already recorded. */
function replay(row: Row) {
  if (row.status === 'committed')
    return ok({ preview: previewView(row), message: row.resultMessage ?? 'Saved.' });
  if (row.status === 'failed')
    return err<ConfirmError>({
      reason: 'Failed',
      message: row.resultMessage ?? 'It failed.',
      preview: previewView(row),
    });
  return err<ConfirmError>({ reason: 'InProgress' });
}

export async function confirmPreview(
  owner: Owner,
  capabilities: Capability[],
  origin: string,
  id: string,
  idempotencyKey: string,
) {
  const row = await findOwned(owner, id);
  if (!row) return err<ConfirmError>({ reason: 'NotFound' });
  if (row.idempotencyKey === idempotencyKey) return replay(row);
  if (row.status !== 'pending') return err<ConfirmError>({ reason: 'Closed', status: row.status });
  const ids = { conversationId: row.conversationId, previewId: row.id };
  if (row.expiresAt.getTime() < Date.now()) {
    await settle(row, { status: 'expired' });
    await audit(owner, 'preview_expired', { operation: row.operation }, ids);
    return err<ConfirmError>({ reason: 'Closed', status: 'expired' });
  }

  const tool = findProposeTool(row.operation);
  if (!tool || !capabilities.includes(tool.capability)) {
    await audit(
      owner,
      'tool_rejected',
      { operation: row.operation, reason: 'NotAllowed', at: 'confirm' },
      ids,
    );
    return err<ConfirmError>({ reason: 'NotAllowed' });
  }

  // Claim it: only one request moves it out of pending. A key already used on another preview is refused by the
  // unique index, which also counts as "not this one".
  let claimed: { id: string }[] = [];
  try {
    claimed = await db
      .update(copilotPreview)
      .set({ status: 'confirmed', idempotencyKey, confirmedAt: new Date() })
      .where(and(eq(copilotPreview.id, row.id), eq(copilotPreview.status, 'pending')))
      .returning({ id: copilotPreview.id });
  } catch (error) {
    log.warn('copilot', 'claim refused', { preview: row.id, error });
  }
  if (!claimed.length) {
    const now = await findOwned(owner, id);
    return now?.idempotencyKey === idempotencyKey
      ? replay(now)
      : err<ConfirmError>({ reason: 'Closed', status: now?.status ?? 'cancelled' });
  }
  await audit(owner, 'preview_confirmed', { operation: row.operation }, ids);

  const fail = async (code: string, message: string) => {
    const failed = await settle(row, { status: 'failed', errorCode: code, resultMessage: message });
    await audit(owner, 'preview_failed', { operation: row.operation, code }, ids);
    return err<ConfirmError>({ reason: 'Failed', message, preview: previewView(failed) });
  };

  const snapshot = await loadSnapshot(owner);
  if (!snapshot) return fail('NotFound', 'The business was not found.');
  const payload = tool.schema.safeParse(row.payload);
  if (!payload.success) return fail('InvalidPayload', 'This change is no longer valid. Ask again.');

  if ((await hashBase(tool, { snapshot }, payload.data)) !== row.baseHash) {
    const stale = await settle(row, {
      status: 'stale',
      errorCode: 'Stale',
      resultMessage:
        'Something changed since this preview was made, so nothing was saved. Ask again for a fresh one.',
    });
    await audit(owner, 'preview_stale', { operation: row.operation }, ids);
    return err<ConfirmError>({ reason: 'Stale', preview: previewView(stale) });
  }

  let outcome: Awaited<ReturnType<ProposeTool['commit']>>;
  try {
    outcome = await tool.commit({ owner, capabilities, origin, snapshot }, payload.data);
  } catch (error) {
    log.error('copilot', 'commit threw', { preview: row.id, operation: row.operation, error });
    return fail('Unexpected', 'Something went wrong, nothing was confirmed. Try again in a moment.');
  }
  const [commitError, result] = outcome;
  if (commitError) return fail(commitError.reason, commitError.message);

  const committed = await settle(row, {
    status: 'committed',
    committedAt: new Date(),
    resultMessage: result.message,
  });
  await audit(
    owner,
    'preview_committed',
    { operation: row.operation, fields: row.diff.map((d) => d.field) },
    ids,
  );
  // In the conversation too, so the model knows on the next turn what was really done.
  await addMessage(row.conversationId, {
    role: 'event',
    content: `${operationTitles[row.operation] ?? 'Change'} confirmed by the owner: ${result.message}`,
  });
  return ok({ preview: previewView(committed), message: result.message });
}

export async function cancelPreview(owner: Owner, id: string) {
  const row = await findOwned(owner, id);
  if (!row) return err({ reason: 'NotFound' as const });
  if (row.status !== 'pending') return err({ reason: 'Closed' as const, status: row.status });
  const [updated] = await db
    .update(copilotPreview)
    .set({ status: 'cancelled', errorCode: 'ByOwner' })
    .where(and(eq(copilotPreview.id, row.id), eq(copilotPreview.status, 'pending')))
    .returning();
  if (!updated) return err({ reason: 'Closed' as const, status: row.status });
  await audit(
    owner,
    'preview_cancelled',
    { operation: row.operation },
    { conversationId: row.conversationId, previewId: row.id },
  );
  return ok({ preview: previewView(updated) });
}

/** Previews made for an answer the owner stopped: they're cancelled with it. */
export async function cancelPreviewsOf(messageId: string) {
  await db
    .update(copilotPreview)
    .set({ status: 'cancelled', errorCode: 'Stopped' })
    .where(and(eq(copilotPreview.messageId, messageId), eq(copilotPreview.status, 'pending')));
}
