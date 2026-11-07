/** Connecta AI wordmark: a link icon on a dark tile and the name, in the style of Fonecta Connect's portal. */
export function ConnectLogo(props: { compact?: boolean }) {
  return (
    <span class="flex items-center gap-1.5 text-primary">
      <span class="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-content">
        {/* Lucide "link" (ISC licence): connecting the business to every place customers look. */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.25"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-4.5"
          aria-hidden="true"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </span>
      {!props.compact && <span class="text-xl font-extrabold tracking-tight italic">Connecta AI</span>}
    </span>
  );
}
