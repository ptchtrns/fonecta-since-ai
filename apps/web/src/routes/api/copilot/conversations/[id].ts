import { copilotIdSchema } from '~/schemas/copilot.schema';
import { currentUser, json, notFound, unauthorized, type ApiEvent } from '~/server/http';
import { conversationView, deleteConversation, findConversation } from '~/services/copilot-store.service';

const ownerOf = (event: ApiEvent) => {
  const user = currentUser(event);
  return user?.entityId ? { userId: user.id, entityId: user.entityId } : null;
};

/** One of the account's conversations, for the panel. */
export async function GET(event: ApiEvent) {
  if (!currentUser(event)) return unauthorized();
  const owner = ownerOf(event);
  const params = copilotIdSchema.safeParse(event.params);
  if (!owner || !params.success) return notFound();
  const conversation = await findConversation(owner, params.data.id);
  if (!conversation) return notFound();
  return json({ data: await conversationView(conversation) });
}

/** The owner deletes a conversation: its messages and previews go, the audit log stays. */
export async function DELETE(event: ApiEvent) {
  if (!currentUser(event)) return unauthorized();
  const owner = ownerOf(event);
  const params = copilotIdSchema.safeParse(event.params);
  if (!owner || !params.success) return notFound();
  if (!(await deleteConversation(owner, params.data.id))) return notFound();
  return json({ message: 'Conversation deleted' });
}
