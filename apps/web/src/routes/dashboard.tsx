import type { RouteDefinition } from '@solidjs/router';
import { createMemo, For, Show, type ParentProps } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { ChooseBusiness } from '~/components/connect/ChooseBusiness';
import { ConnectLogo } from '~/components/connect/ConnectLogo';
import { CopilotPanel } from '~/components/copilot/CopilotPanel';
import { CopilotProvider } from '~/components/copilot/CopilotProvider';
import {
  ChartIcon,
  ChevronsIcon,
  CollapseIcon,
  EyeIcon,
  InboxIcon,
  LogoutIcon,
  MenuIcon,
  PlugIcon,
  StoreIcon,
  UserIcon,
} from '~/components/connect/icons';
import { authClient } from '~/lib/auth-client';
import { profileMissing, visibilityCounts } from '~/lib/visibility';
import { requireUser } from '~/queries/session';
import { getWorkspace, type Workspace } from '~/queries/workspace';

export const route = {
  preload: () => {
    void requireUser();
    void getWorkspace();
  },
} satisfies RouteDefinition;

const DRAWER_ID = 'dashboard-drawer';
const COLLAPSED_KEY = 'sidebar-collapsed';

// `exact`: only highlighted on the page itself, not on the pages under it.
type Link = { href: string; label: string; icon: () => JSX.Element; exact?: boolean };
const pages: Link[] = [
  { href: '/dashboard', label: 'Front page', icon: () => <InboxIcon />, exact: true },
  { href: '/dashboard/company', label: 'Company information', icon: () => <StoreIcon /> },
  { href: '/dashboard/visibility', label: 'Visibility', icon: () => <EyeIcon /> },
  { href: '/dashboard/reports', label: 'Reports', icon: () => <ChartIcon /> },
];
const maintenance: Link[] = [
  { href: '/dashboard/connections', label: 'Connections', icon: () => <PlugIcon /> },
  { href: '/dashboard/account', label: 'Account', icon: () => <UserIcon /> },
];

/** What needs the owner on each page, next to its name. */
function navCounts(w: Workspace | null): Record<string, number> {
  if (!w) return {};
  const visibility = visibilityCounts(w.presence);
  return {
    '/dashboard': w.suggestions.pending.length,
    '/dashboard/company': profileMissing(w.presence.profile),
    '/dashboard/visibility': visibility.listings + visibility.seo + visibility.ai,
  };
}

// Layout for every page under /dashboard. Guests are redirected by middleware and by requireUser.
// The drawer checkbox means "overlay open" on small screens and "expanded" on large ones.
export default function DashboardLayout(props: ParentProps) {
  const user = createMemo(() => requireUser());
  const workspace = createMemo(() => getWorkspace());
  const counts = () => navCounts(workspace());
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
      <input
        id={DRAWER_ID}
        ref={initToggle}
        type="checkbox"
        class="drawer-toggle"
        onChange={rememberState}
      />
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
            <CopilotProvider>
              {props.children}
              <CopilotPanel />
            </CopilotProvider>
          </Show>
        </main>
      </div>

      <div class="drawer-side z-20 is-drawer-close:overflow-visible">
        <label for={DRAWER_ID} aria-label="Close menu" class="drawer-overlay" />
        <aside class="flex min-h-full w-64 flex-col border-r border-base-300 bg-base-100 transition-[width] duration-200 is-drawer-close:w-16">
          <div class="flex flex-col gap-0.5 px-4 pt-4 pb-3 is-drawer-close:px-2">
            <div class="flex items-center justify-between gap-2 is-drawer-close:justify-center">
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
          </div>

          <nav class="flex grow flex-col" aria-label="Dashboard">
            <ul class="menu w-full gap-1 px-2">
              <li class="menu-title is-drawer-close:hidden">Business</li>
              <For each={pages}>
                {(link) => <NavItem link={link} count={counts()[link.href]} onPick={closeOnMobile} />}
              </For>
            </ul>
            <ul class="menu w-full gap-1 px-2">
              <li class="menu-title is-drawer-close:hidden">Maintenance</li>
              <For each={maintenance}>{(link) => <NavItem link={link} onPick={closeOnMobile} />}</For>
            </ul>
          </nav>

          <div class="border-t border-base-300 p-2">
            <Show when={workspace()}>
              {(w) => (
                <a
                  href="/dashboard/company"
                  class="mb-2 block rounded-field border border-base-300 px-3 py-2 hover:bg-base-200 is-drawer-close:hidden"
                  onClick={closeOnMobile}
                >
                  <span class="block truncate text-sm font-medium">{w().business.name}</span>
                  <span class="block truncate text-xs text-base-content/60">
                    {[w().business.category, w().business.city].filter(Boolean).join(' · ')}
                  </span>
                </a>
              )}
            </Show>
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
                <span class="text-base-content/40 is-drawer-close:hidden">
                  <ChevronsIcon />
                </span>
              </div>
              <ul
                tabindex="0"
                class="menu dropdown-content z-30 [&_a:active]:bg-base-200 [&_a:active]:text-base-content mb-2 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
              >
                <li>
                  <a href="/dashboard/account" onClick={closeOnMobile}>
                    <UserIcon />
                    Account
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

// The router marks links: `aria-current` on the link to this exact page (query included), `data-active` also on a
// page's link while on a page under it, such as a Visibility tab.
const current =
  'aria-[current=page]:bg-base-200 aria-[current=page]:font-medium aria-[current=page]:text-base-content';
const activeWithin = 'data-active:bg-base-200 data-active:font-medium data-active:text-base-content';

function NavItem(props: { link: Link; count?: number; onPick: () => void }) {
  return (
    <li>
      <a
        href={props.link.href}
        class={[
          'gap-3 py-2.5 text-base-content/70 is-drawer-close:tooltip is-drawer-close:tooltip-right active:bg-base-200 active:text-base-content',
          props.link.exact ? current : activeWithin,
        ]}
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
