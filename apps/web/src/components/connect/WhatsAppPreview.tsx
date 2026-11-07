import { For, Show } from 'solid-js';

/** WhatsApp's own formatting: *bold* and _italic_. Rendered as elements, never as HTML. */
function Formatted(props: { line: string }) {
  const parts = () => props.line.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).filter(Boolean);
  return (
    <For each={parts()}>
      {(part) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
          <strong>{part.slice(1, -1)}</strong>
        ) : part.startsWith('_') && part.endsWith('_') && part.length > 2 ? (
          <em>{part.slice(1, -1)}</em>
        ) : (
          part
        )
      }
    </For>
  );
}

/** The message as it lands on the owner's phone: a WhatsApp bubble with its reply buttons. */
export function WhatsAppPreview(props: { body: string; buttons?: string[] }) {
  return (
    <div class="rounded-box bg-[#efeae2] p-3">
      <div class="max-w-md rounded-lg rounded-tl-none bg-white p-3 text-sm leading-relaxed text-[#111b21] shadow-sm">
        <For each={props.body.split('\n')}>
          {(line) =>
            line ? (
              <div class="break-words">
                <Formatted line={line} />
              </div>
            ) : (
              <div class="h-2" />
            )
          }
        </For>
      </div>
      <Show when={props.buttons?.length}>
        <div
          class="mt-1 grid max-w-md gap-1"
          style={{ 'grid-template-columns': `repeat(${props.buttons!.length}, 1fr)` }}
        >
          <For each={props.buttons}>
            {(b) => (
              <span class="rounded-lg bg-white py-2 text-center text-sm font-medium text-[#027eb5] shadow-sm">
                {b}
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
