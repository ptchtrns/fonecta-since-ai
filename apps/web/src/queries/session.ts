import { query } from '@solidjs/router';
import { redirect } from '@solidjs/web';
import { ApiError, apiGet } from '~/lib/api';

export type CurrentUser = { id: string; name: string; email: string; createdAt: string };

async function fetchCurrentUser() {
  try {
    return await apiGet<CurrentUser>('/api/me');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** The signed-in user, or null for guests. */
export const getCurrentUser = query(fetchCurrentUser, 'current-user');

/** The signed-in user. Guests are sent to the login page. */
export const requireUser = query(async () => {
  const user = await fetchCurrentUser();
  if (!user) throw redirect('/login');
  return user;
}, 'require-user');

export const userKeys = [getCurrentUser.key, requireUser.key];
