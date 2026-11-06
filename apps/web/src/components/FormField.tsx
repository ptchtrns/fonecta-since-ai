import type { JSX } from '@solidjs/web';
import { Show } from 'solid-js';

type Props = {
  label: string;
  error?: string;
  hint?: string;
  children: JSX.Element;
};

/** Label, control and an error or hint below it. Pass an input styled with `input w-full`. */
export function FormField(props: Props) {
  return (
    <label class="flex flex-col gap-1.5">
      <span class="font-medium">{props.label}</span>
      {props.children}
      <Show
        when={props.error}
        fallback={
          <Show when={props.hint}>{(hint) => <span class="text-base-content/70">{hint()}</span>}</Show>
        }
      >
        {(error) => <span class="text-error">{error()}</span>}
      </Show>
    </label>
  );
}
