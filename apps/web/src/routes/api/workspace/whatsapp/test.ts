import { currentUser, json, notFound, unauthorized, type ApiEvent } from '~/server/http';
import { getBusiness } from '~/services/business.service';
import { sendTest } from '~/services/contact.service';

export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  const business = user.entityId ? await getBusiness(user.entityId) : null;
  if (!business) return notFound('Choose your business first');

  const [error] = await sendTest(business);
  if (error) {
    switch (error.reason) {
      case 'NoPhone':
        return json({ message: 'Add your WhatsApp number first' }, 400);
      case 'NotConfigured':
        return json({ message: 'WhatsApp sending is not set up yet' }, 503);
      default:
        return json({ message: `WhatsApp didn't send it: ${error.message}` }, 502);
    }
  }
  return json({
    message: 'Test message sent. Reply to it, and suggestions can reach you for the next 24 hours.',
  });
}
