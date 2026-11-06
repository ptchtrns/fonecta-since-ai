import { createSignal, onSettled } from 'solid-js';
import { formatDateTime } from '~/lib/format';

/**
 * Renders HH:MM:SS DD.MM.YYYY. The server and hydration pass use UTC so markup matches,
 * then the browser switches to its local time zone.
 */
export function DateTime(props: { value: string | Date }) {
  const [local, setLocal] = createSignal(false);
  onSettled(() => {
    setLocal(true);
  });

  return (
    <time datetime={new Date(props.value).toISOString()} title={local() ? undefined : 'UTC'}>
      {formatDateTime(props.value, !local())}
    </time>
  );
}
