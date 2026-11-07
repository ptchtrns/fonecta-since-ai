import { createMemo, Show } from 'solid-js';
import { ConnectLogo } from '~/components/connect/ConnectLogo';
import { getCurrentUser } from '~/queries/session';

export function SiteHeader() {
  const user = createMemo(() => getCurrentUser());

  return (
    <header class="sticky top-0 z-30 border-b border-base-300/60 bg-base-200/70 backdrop-blur-lg">
      <div class="navbar mx-auto max-w-6xl px-4">
        <div class="flex-1">
          <a href="/" aria-label="Connecta AI home">
            <ConnectLogo />
          </a>
        </div>
        <nav class="flex items-center gap-1 sm:gap-2">
          {/* target="_self" leaves in-page anchors to the browser, so the router does not mark them current. */}
          <a href="/#features" target="_self" class="btn btn-ghost btn-sm hidden font-normal sm:inline-flex">
            Features
          </a>
          <a
            href="/#how-it-works"
            target="_self"
            class="btn btn-ghost btn-sm hidden font-normal sm:inline-flex"
          >
            How it works
          </a>
          <Show
            when={user()}
            fallback={
              <>
                <a href="/login" class="btn btn-ghost btn-sm font-normal">
                  Sign in
                </a>
                <a href="/login?mode=sign-up" class="btn btn-primary btn-sm">
                  Get started
                </a>
              </>
            }
          >
            <a href="/dashboard" class="btn btn-primary btn-sm">
              Dashboard
            </a>
          </Show>
        </nav>
      </div>
    </header>
  );
}
