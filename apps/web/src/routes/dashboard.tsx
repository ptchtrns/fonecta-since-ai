import type { RouteDefinition } from '@solidjs/router';
import { createMemo, For, Show, type ParentProps } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { ChooseBusiness } from '~/components/connect/ChooseBusiness';
import { ConnectLogo } from '~/components/connect/ConnectLogo';
import { authClient } from '~/lib/auth-client';
import { requireUser } from '~/queries/session';
import { getWorkspace } from '~/queries/workspace';

export const route = {
  preload: () => {
    void requireUser();
    void getWorkspace();
  },
} satisfies RouteDefinition;

const DRAWER_ID = 'dashboard-drawer';
const COLLAPSED_KEY = 'sidebar-collapsed';

type Link = { href: string; label: string; icon: () => JSX.Element };
const links: Link[] = [
  { href: '/dashboard', label: 'Home', icon: HomeIcon },
  { href: '/dashboard/sources', label: 'Sources', icon: ShieldIcon },
  { href: '/dashboard/integrations', label: 'Integrations', icon: PlugIcon },
];

// Layout for every page under /dashboard. Guests are redirected by middleware and by requireUser.
// The drawer checkbox means "overlay open" on small screens and "expanded" on large ones.
export default function DashboardLayout(props: ParentProps) {
  const user = createMemo(() => requireUser());
  const workspace = createMemo(() => getWorkspace());
  // The number of waiting suggestions, next to Home.
  const counts = (): Record<string, number> => ({
    '/dashboard': workspace()?.suggestions.pending.length ?? 0,
  });
  let toggle!: HTMLInputElement;

  const isLarge = () => window.matchMedia('(min-width: 64rem)').matches;

  // Large screens start expanded unless the user collapsed the sidebar last time.
  function initToggle(el: HTMLInputElement) {
    toggle = el;
    let collapsed = false;
    try {
      collapsed = localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {}
    el.checked = isLarge() && !collapsed;
  }

  function rememberState() {
    if (!isLarge()) return;
    try {
      localStorage.setItem(COLLAPSED_KEY, toggle.checked ? '0' : '1');
    } catch {}
  }

  // Close the overlay after picking a page on small screens.
  function closeOnMobile() {
    if (!isLarge()) toggle.checked = false;
  }

  async function signOut() {
    await authClient.signOut();
    // Full reload drops every cached query holding the previous user's data.
    window.location.assign('/');
  }

  return (
    <div class="drawer lg:drawer-open">
      <input id={DRAWER_ID} ref={initToggle} type="checkbox" class="drawer-toggle" onChange={rememberState} />
      <div class="drawer-content flex min-h-screen flex-col">
        <header class="navbar sticky top-0 z-10 border-b border-base-300 bg-base-100/80 px-4 backdrop-blur lg:hidden">
          <label for={DRAWER_ID} class="btn btn-square btn-ghost" aria-label="Open menu">
            <MenuIcon />
          </label>
          <a href="/dashboard" class="ml-2">
            <ConnectLogo />
          </a>
        </header>
        <main class="flex-1 p-4 lg:p-8">
          <Show
            when={workspace()}
            fallback={
              <div class="mx-auto max-w-lg">
                <ChooseBusiness title="Which business is yours?" />
              </div>
            }
          >
            {props.children}
          </Show>
        </main>
      </div>

      <div class="drawer-side z-20 is-drawer-close:overflow-visible">
        <label for={DRAWER_ID} aria-label="Close menu" class="drawer-overlay" />
        <aside class="flex min-h-full w-64 flex-col border-r border-base-300 bg-base-100 transition-[width] duration-200 is-drawer-close:w-16">
          <div class="flex h-16 items-center justify-between gap-2 px-4 is-drawer-close:justify-center is-drawer-close:px-2">
            <a href="/dashboard" class="is-drawer-close:hidden" onClick={closeOnMobile}>
              <ConnectLogo />
            </a>
            <div class="is-drawer-close:tooltip is-drawer-close:tooltip-right" data-tip="Expand">
              <label
                for={DRAWER_ID}
                class="btn btn-square btn-ghost btn-sm text-base-content/60"
                aria-label="Toggle sidebar"
              >
                <span class="is-drawer-close:rotate-180">
                  <CollapseIcon />
                </span>
              </label>
            </div>
          </div>

          <ul class="menu w-full grow gap-1 px-2">
            <For each={links}>
              {(link) => <NavItem link={link} count={counts()[link.href]} onPick={closeOnMobile} />}
            </For>
          </ul>

          <div class="border-t border-base-300 p-2">
            <div class="dropdown dropdown-top w-full is-drawer-close:dropdown-right is-drawer-close:dropdown-end">
              <div
                tabindex="0"
                role="button"
                class="btn btn-ghost h-auto w-full justify-start gap-3 px-2 py-2 font-normal is-drawer-close:justify-center"
              >
                <div class="avatar avatar-placeholder">
                  <div class="w-8 rounded-full bg-base-300 text-base-content">
                    <span>{user().name.charAt(0).toUpperCase()}</span>
                  </div>
                </div>
                <div class="min-w-0 flex-1 text-left is-drawer-close:hidden">
                  <div class="truncate text-sm font-medium">{user().name}</div>
                  <div class="truncate text-xs text-base-content/60">{user().email}</div>
                </div>
                <ChevronsIcon />
              </div>
              <ul
                tabindex="0"
                class="menu dropdown-content z-30 [&_a:active]:bg-base-200 [&_a:active]:text-base-content mb-2 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
              >
                <li>
                  <a href="/dashboard/settings" onClick={closeOnMobile}>
                    <CogIcon />
                    Settings
                  </a>
                </li>
                <li>
                  <button type="button" class="text-error" onClick={signOut}>
                    <LogoutIcon />
                    Sign out
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function NavItem(props: { link: Link; count?: number; onPick: () => void }) {
  return (
    <li>
      <a
        href={props.link.href}
        class="gap-3 py-2.5 text-base-content/70 is-drawer-close:tooltip is-drawer-close:tooltip-right active:bg-base-200 active:text-base-content aria-[current=page]:bg-base-200 aria-[current=page]:font-medium aria-[current=page]:text-base-content"
        data-tip={props.link.label}
        onClick={props.onPick}
      >
        {props.link.icon()}
        <span class="is-drawer-close:hidden">{props.link.label}</span>
        <Show when={props.count}>
          {(n) => (
            <span class="badge ml-auto badge-sm badge-ghost tabular-nums is-drawer-close:hidden">{n()}</span>
          )}
        </Show>
      </a>
    </li>
  );
}

function Icon(props: ParentProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="size-5 shrink-0 stroke-current"
    >
      {props.children}
    </svg>
  );
}

function MenuIcon() {
  return (
    <Icon>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  );
}

function HomeIcon() {
  return (
    <Icon>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V10Z" />
    </Icon>
  );
}

function ShieldIcon() {
  return (
    <Icon>
      <path d="M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

function PlugIcon() {
  return (
    <Icon>
      <path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8ZM12 18v4" />
    </Icon>
  );
}

function CogIcon() {
  return (
    <Icon>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Icon>
  );
}

function LogoutIcon() {
  return (
    <Icon>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </Icon>
  );
}

function ChevronsIcon() {
  return (
    <span class="text-base-content/40 is-drawer-close:hidden">
      <Icon>
        <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
      </Icon>
    </span>
  );
}

function CollapseIcon() {
  return (
    <Icon>
      <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5ZM9 3v18M16 15l-3-3 3-3" />
    </Icon>
  );
}
