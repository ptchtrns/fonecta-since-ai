import { Show } from 'solid-js';
import type { FormMessage as Message } from '~/lib/form';

export function FormMessage(props: { message: Message | null }) {
  return (
    <Show when={props.message}>
      {(message) => (
        <div role="alert" class={['alert', message().type === 'success' ? 'alert-success' : 'alert-error']}>
          <span>{message().text}</span>
        </div>
      )}
    </Show>
  );
}
