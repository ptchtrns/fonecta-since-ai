import { currentUser, json, unauthorized, type ApiEvent } from '~/server/http';
import { aiEnabled } from '~/server/ai';
import { conversationView, latestConversation } from '~/services/copilot-store.service';

/** Whether the copilot can answer, and the account's latest conversation to continue, or null. */
export async function GET(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  if (!user.entityId) return json({ data: { enabled: false, conversation: null } });
  const latest = await latestConversation({ userId: user.id, entityId: user.entityId });
  return json({
    data: { enabled: aiEnabled(), conversation: latest ? await conversationView(latest) : null },
  });
}
