import { createSignal, For, Show } from 'solid-js';
import { apiGet } from '~/lib/api';

export type BusinessOption = { id: string; name: string; address: string; city: string };

const SEARCH_DELAY_MS = 150;

/**
 * Finds a business by name, city or street as the owner types, and submits its id in a hidden `entityId` field.
 * Follows the ARIA combobox pattern: focus stays in the input, arrow keys move through the list, Enter picks.
 */
export function BusinessCombobox(props: { error?: string; onSelect?: (option: BusinessOption) => void }) {
  const [text, setText] = createSignal('');
  const [options, setOptions] = createSignal<BusinessOption[]>([]);
  const [selected, setSelected] = createSignal<BusinessOption | null>(null);
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  const [loading, setLoading] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Answers can arrive out of order. Only the newest search may show its results.
  let latest = 0;

  async function search(q: string) {
    const request = ++latest;
    setLoading(true);
    try {
      const results = await apiGet<BusinessOption[]>(`/api/businesses?q=${encodeURIComponent(q)}`);
      if (request !== latest) return;
      setOptions(results);
      setActive(0);
      setFailed(false);
    } catch {
      if (request === latest) setFailed(true);
    }
    if (request === latest) setLoading(false);
  }

  function onInput(value: string) {
    setText(value);
    setSelected(null);
    setOpen(true);
    clearTimeout(timer);
    timer = setTimeout(() => search(value.trim()), SEARCH_DELAY_MS);
  }

  function onFocus() {
    if (selected()) return;
    setOpen(true);
    if (!options().length) void search(text().trim());
  }

  function choose(option: BusinessOption) {
    setSelected(option);
    setText(`${option.name}, ${option.city}`);
    setOpen(false);
    props.onSelect?.(option);
  }

  function onKeyDown(event: KeyboardEvent) {
    const count = options().length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open()) setOpen(true);
      else if (count) setActive((active() + 1) % count);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (count) setActive((active() - 1 + count) % count);
    } else if (event.key === 'Enter' && open()) {
      // Picks from the list instead of submitting the form.
      event.preventDefault();
      const option = options()[active()];
      if (option) choose(option);
    } else if (event.key === 'Escape' && open()) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div class="flex flex-col gap-1.5">
      <label for="business-search" class="font-medium">
        Your business
      </label>
      <input type="hidden" name="entityId" value={selected()?.id ?? ''} />
      <div class="relative">
        <input
          id="business-search"
          type="text"
          role="combobox"
          class={['input w-full', { 'input-error': !!props.error && !selected() }]}
          placeholder="Name, street or city"
          autocomplete="off"
          aria-autocomplete="list"
          aria-expanded={open() ? 'true' : 'false'}
          aria-controls="business-options"
          aria-activedescendant={open() && options().length ? `business-option-${active()}` : undefined}
          value={text()}
          onInput={(e) => onInput(e.currentTarget.value)}
          onFocus={onFocus}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        <Show when={loading()}>
          <span class="loading absolute top-3 right-3 loading-spinner loading-xs text-base-content/50" />
        </Show>
        <Show when={open()}>
          <ul
            id="business-options"
            role="listbox"
            aria-label="Businesses"
            class="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-lg"
            // Keeps focus in the input, so the blur above doesn't close the list before a click lands.
            onMouseDown={(e) => e.preventDefault()}
          >
            <For
              each={options()}
              fallback={
                <li class="px-3 py-2 text-sm text-base-content/60">
                  {failed()
                    ? 'Search failed. Keep typing to try again.'
                    : loading()
                      ? 'Searching…'
                      : 'No business found'}
                </li>
              }
            >
              {(option, i) => (
                <li
                  id={`business-option-${i()}`}
                  role="option"
                  aria-selected={i() === active() ? 'true' : 'false'}
                  class={['cursor-pointer rounded-field px-3 py-2', { 'bg-base-200': i() === active() }]}
                  onMouseEnter={() => setActive(i())}
                  onClick={() => choose(option)}
                >
                  <div class="truncate font-medium">{option.name}</div>
                  <div class="truncate text-sm text-base-content/60">
                    {option.address}, {option.city}
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
      <Show when={props.error && !selected()}>
        <span class="text-error">{props.error}</span>
      </Show>
    </div>
  );
}
