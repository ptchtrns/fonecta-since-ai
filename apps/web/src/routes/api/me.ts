import { currentUser, json, unauthorized, type ApiEvent } from '~/server/http';

export function GET(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  return json({ data: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } });
}
