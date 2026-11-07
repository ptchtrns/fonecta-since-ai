import { currentUser, notFound, unauthorized, type ApiEvent } from '~/server/http';
import { testReply } from '~/server/channel-replies';
import { getBusiness } from '~/services/business.service';
import { sendTest } from '~/services/contact.service';

export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();
  const business = user.entityId ? await getBusiness(user.entityId) : null;
  if (!business) return notFound('Choose your business first');

  const [error] = await sendTest(business, 'TELEGRAM');
  return testReply('TELEGRAM', error, 'Test message sent to Telegram.');
}
