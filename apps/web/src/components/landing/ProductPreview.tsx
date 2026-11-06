import { For, type ParentProps } from 'solid-js';

const nav = [
  { label: 'Jobs', count: '128', icon: InboxIcon },
  { label: 'Uploads', count: '9', icon: FileIcon },
  { label: 'Analytics', icon: ChartIcon },
  { label: 'Failed', count: '23', icon: AlertIcon },
  { label: 'AI', icon: SparklesIcon },
  { label: 'Settings', icon: CogIcon },
];

const jobs = [
  {
    title: 'support_agent',
    subject: 'Summarize ticket #4821',
    time: '2 min ago',
    preview:
      'Pulled 14 messages from the thread, classified the issue as billing and drafted a reply for review before sending.',
    tags: ['ai', 'support', 'queued'],
    active: 1,
  },
  {
    title: 'planner',
    subject: 'Nightly report export',
    time: '1 hour ago',
    preview: 'Aggregated yesterday’s runs into a CSV and uploaded it to R2 for the analytics page.',
    tags: ['cron', 'export'],
    active: -1,
  },
];

// Static mock of the dashboard for the hero. Decorative, so hidden from assistive tech.
export function ProductPreview() {
  const job = jobs[0]!;
  return (
    <div class="relative mx-auto w-full max-w-6xl" aria-hidden="true">
      <div class="rounded-t-[1.75rem] border border-b-0 border-base-content/25 border-t-base-content/60 bg-base-200 px-2 pt-2 mask-[linear-gradient(to_bottom,black_55%,transparent)] sm:px-3 sm:pt-3">
        <div class="flex h-[26rem] overflow-hidden text-left sm:h-[28rem]">
          {/* Sidebar */}
          <div class="hidden w-60 shrink-0 flex-col border-r border-base-300 md:flex">
            <div class="flex h-16 items-center border-b border-base-300 px-3">
              <div class="flex w-full items-center gap-3 rounded-field border border-base-300 px-3 py-2 text-sm">
                <svg viewBox="0 0 24 24" fill="currentColor" class="size-4 shrink-0">
                  <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
                </svg>
                <span class="flex-1 truncate">Hackathon</span>
                <ChevronDownIcon />
              </div>
            </div>
            <div class="flex flex-col gap-1 p-3">
              <For each={nav}>
                {(item, i) => (
                  <div
                    class={[
                      'flex items-center gap-3 rounded-field px-3 py-2.5 text-sm',
                      i() === 0 ? 'bg-base-300 font-medium' : 'text-base-content/70',
                    ]}
                  >
                    <item.icon />
                    <span class="flex-1">{item.label}</span>
                    {item.count && <span class="tabular-nums">{item.count}</span>}
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* List */}
          <div class="flex min-w-0 flex-1 flex-col border-base-300 lg:max-w-md lg:border-r">
            <div class="flex h-16 items-center justify-between gap-3 border-b border-base-300 px-4">
              <span class="text-xl font-semibold">Jobs</span>
              <div class="flex rounded-field bg-base-300 p-1 text-sm">
                <span class="rounded-[0.35rem] bg-base-100 px-3 py-1">All jobs</span>
                <span class="px-3 py-1 text-base-content/70">Failed</span>
              </div>
            </div>
            <div class="flex flex-col gap-3 p-4">
              <div class="flex items-center gap-2 rounded-field border border-base-300 px-3 py-2 text-sm text-base-content/50">
                <SearchIcon />
                Search
              </div>
              <For each={jobs}>
                {(j, i) => (
                  <div
                    class={[
                      'flex flex-col gap-2 rounded-field border border-base-300 p-3',
                      { 'bg-base-300/60': i() === 0 },
                    ]}
                  >
                    <div class="flex items-baseline justify-between gap-2">
                      <span class="truncate font-mono text-sm font-semibold">{j.title}</span>
                      <span class="shrink-0 text-xs text-base-content/60">{j.time}</span>
                    </div>
                    <span class="text-xs font-medium">{j.subject}</span>
                    <p class="line-clamp-2 text-xs text-base-content/50">{j.preview}</p>
                    <div class="flex gap-1 text-xs">
                      <For each={j.tags}>
                        {(tag, t) => (
                          <span
                            class={[
                              'rounded-[0.35rem] px-2.5 py-0.5',
                              t() === j.active ? 'bg-base-content/15 font-medium' : 'text-base-content/60',
                            ]}
                          >
                            {tag}
                          </span>
                        )}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* Detail */}
          <div class="hidden min-w-0 flex-1 flex-col lg:flex">
            <div class="flex h-16 items-center gap-1 border-b border-base-300 px-3 text-base-content/80">
              <ToolButton>
                <RetryIcon />
              </ToolButton>
              <ToolButton>
                <ArchiveIcon />
              </ToolButton>
              <ToolButton>
                <TrashIcon />
              </ToolButton>
              <span class="mx-1 h-6 w-px bg-base-300" />
              <ToolButton>
                <ClockIcon />
              </ToolButton>
              <span class="ml-auto" />
              <ToolButton>
                <ShareIcon />
              </ToolButton>
              <span class="mx-1 h-6 w-px bg-base-300" />
              <ToolButton>
                <DotsIcon />
              </ToolButton>
            </div>
            <div class="flex items-start gap-3 border-b border-base-300 p-4">
              <span class="grid size-11 shrink-0 place-items-center rounded-full bg-base-300 text-sm">
                SA
              </span>
              <div class="min-w-0 flex-1 text-sm">
                <div class="font-mono font-semibold">{job.title}</div>
                <div class="mt-0.5 text-xs">{job.subject}</div>
                <div class="mt-1 text-xs">
                  <span class="font-medium">Trace:</span>{' '}
                  <span class="font-mono text-base-content/70">tr_0edc66 · 1.58s</span>
                </div>
              </div>
              <span class="shrink-0 text-xs text-base-content/60">Nov 6, 2026, 9:00:00 AM</span>
            </div>
            <div class="flex flex-col gap-4 p-4 text-sm text-base-content/60">
              <p>
                Pulled 14 messages from the thread and classified the issue as billing. The customer was
                charged twice for the same plan after upgrading mid-cycle.
              </p>
              <p>
                Drafted a reply that confirms the duplicate charge and explains the refund timeline. Waiting
                on a human to approve before it goes out.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton(props: ParentProps) {
  return <span class="grid size-9 place-items-center rounded-field">{props.children}</span>;
}

function Icon(props: ParentProps<{ class?: string }>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={['shrink-0 stroke-current', props.class ?? 'size-[1.125rem]']}
    >
      {props.children}
    </svg>
  );
}

function InboxIcon() {
  return (
    <Icon>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </Icon>
  );
}

function FileIcon() {
  return (
    <Icon>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
    </Icon>
  );
}

function ChartIcon() {
  return (
    <Icon>
      <path d="M3 3v18h18" />
      <path d="m7 15 4-4 3 3 5-6" />
    </Icon>
  );
}

function AlertIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </Icon>
  );
}

function SparklesIcon() {
  return (
    <Icon>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </Icon>
  );
}

function CogIcon() {
  return (
    <Icon>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

function ChevronDownIcon() {
  return (
    <Icon class="size-4 text-base-content/60">
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

function SearchIcon() {
  return (
    <Icon class="size-4">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  );
}

function RetryIcon() {
  return (
    <Icon>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

function ArchiveIcon() {
  return (
    <Icon>
      <rect x="2" y="4" width="20" height="5" rx="1" />
      <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9M10 13h4" />
    </Icon>
  );
}

function TrashIcon() {
  return (
    <Icon>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
    </Icon>
  );
}

function ClockIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

function ShareIcon() {
  return (
    <Icon>
      <path d="m15 14 5-5-5-5" />
      <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
    </Icon>
  );
}

function DotsIcon() {
  return (
    <Icon>
      <path d="M12 5h.01M12 12h.01M12 19h.01" />
    </Icon>
  );
}
