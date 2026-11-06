/// <reference types="vite/client" />
/// <reference types="@solidjs/vite-plugin/boundary-modules" />
/// <reference types="@solidjs/vite-plugin/virtual-modules" />
/// <reference types="../file-routes.d.ts" />

import type { AuthSession, SessionUser } from './server/auth';

declare module '@solidjs/web' {
  interface RequestEventLocals {
    user?: SessionUser | null;
    session?: AuthSession['session'] | null;
  }
}
