import type { ParentProps } from 'solid-js';

// Line icons for the dashboard. Paths are from Lucide (ISC, https://lucide.dev).

type IconProps = { class?: string };

export function Icon(props: ParentProps<IconProps>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={['shrink-0 stroke-current', props.class ?? 'size-5']}
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

export const MenuIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icon>
);

export const InboxIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
  </Icon>
);

export const StoreIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <path d="M3 9h18M4 9V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4M5 9v11h14V9M10 20v-5h4v5" />
  </Icon>
);

export const EyeIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const ChartIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <path d="M3 3v16a2 2 0 0 0 2 2h16M8 17v-3M13 17V9M18 17V5" />
  </Icon>
);

export const XIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

export const PlugIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8ZM12 18v4" />
  </Icon>
);

export const UserIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <circle cx="12" cy="8" r="5" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </Icon>
);

export const LogoutIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </Icon>
);

export const ChevronsIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
  </Icon>
);

export const CollapseIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5ZM9 3v18M16 15l-3-3 3-3" />
  </Icon>
);

/** Listings: a globe, for every site the profile is published to. */
export const GlobeIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </Icon>
);

/** Local search: a magnifier with a rising line. */
export const SearchIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.9-4.9M7.5 12l2-2 1.5 1.5L13.5 9" />
  </Icon>
);

/** AI assistants: a chat bubble. */
export const ChatIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z" />
    <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
  </Icon>
);

export const SendIcon = (p: IconProps) => (
  <Icon class={p.class}>
    <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11ZM21.854 2.147l-10.94 10.939" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon class={p.class ?? 'size-4'}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon class={p.class ?? 'size-3'}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
