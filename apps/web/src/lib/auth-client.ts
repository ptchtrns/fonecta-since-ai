import { createAuthClient } from 'better-auth/client';

// Framework-agnostic client; Better Auth's Solid bindings target Solid 1.
export const authClient = createAuthClient({ basePath: '/api/auth' });
