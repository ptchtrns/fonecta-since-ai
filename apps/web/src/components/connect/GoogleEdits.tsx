import { revalidate } from '@solidjs/router';
import { For } from 'solid-js';
import { FormMessage } from '~/components/FormMessage';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { formatDay } from '~/lib/hours';
import { getWorkspace, type Workspace } from '~/queries/workspace';
import { Card } from './Metrics';

type Edit = Workspace['presence']['googleEdits'][number];

/** Edits people suggested on Google and other sites, each with Accept and Reject. */
export function GoogleEdits(props: { edits: Edit[]; onAnswered: (message: string) => void }) {
  return (
    <Card label="Suggested edits" aside={String(props.edits.length)}>
      <ul class="flex flex-col divide-y divide-base-300 text-sm">
        <For each={props.edits}>{(edit) => <EditRow edit={edit} onAnswered={props.onAnswered} />}</For>
      </ul>
      <p class="text-xs text-base-content/50">
        People suggested these changes on Google and other sites. Accepting one publishes it everywhere;
        rejecting keeps your listing as it is.
      </p>
    </Card>
  );
}

function EditRow(props: { edit: Edit; onAnswered: (message: string) => void }) {
  const form = createFormState();
  const closure = () => props.edit.kind === 'closure';

  function answer(accept: boolean) {
    return form.submit(
      async () => {
        const { message } = await apiSend(`/api/workspace/edits/${props.edit.id}`, 'POST', { accept });
        props.onAnswered(message ?? '');
      },
      () => revalidate(getWorkspace.key),
    );
  }

  return (
    <li class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <span class="flex flex-col">
        <span class="font-medium">{props.edit.change}</span>
        <span class="text-xs text-base-content/50">
          Suggested on {props.edit.site}, {formatDay(props.edit.created)}
        </span>
      </span>
      <span class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn btn-xs btn-primary"
          disabled={form.pending()}
          onClick={() => answer(true)}
        >
          {closure() ? 'We have closed' : 'Accept'}
        </button>
        <button
          type="button"
          class="btn btn-xs btn-ghost border-base-300"
          disabled={form.pending()}
          onClick={() => answer(false)}
        >
          {closure() ? 'We’re open' : 'Reject'}
        </button>
      </span>
      <FormMessage message={form.message()} />
    </li>
  );
}
