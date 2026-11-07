import { revalidate } from '@solidjs/router';
import { For, Show } from 'solid-js';
import { FormMessage } from '~/components/FormMessage';
import { Panel } from '~/components/connect/Page';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { getWorkspace, type Workspace } from '~/queries/workspace';

type Contact = Workspace['contact'];

const channelNames: Record<Contact['channel'], string> = {
  SMS: 'Text message',
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
  APP_PUSH: 'Connect app notification',
};

/** "12-16" as "12:00–16:00". */
function contactHours(window: string) {
  const [start, end] = window.split('-');
  if (!start || !end) return 'Any time';
  return `${start.padStart(2, '0')}:00–${end.padStart(2, '0')}:00`;
}

function sentAt(at: string, timeZone: string) {
  return new Date(at).toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
}

/** How the owner wants to be reached, their opt-out, and messages on channels this app doesn't send on yet. */
export function ContactPreferences(props: { contact: Contact }) {
  const form = createFormState();

  function setOptedOut(optedOut: boolean) {
    return form.submit(
      async () => (await apiSend('/api/workspace/contact', 'PATCH', { optedOut })).message,
      () => revalidate(getWorkspace.key),
    );
  }

  return (
    <Panel title="How we reach you" subtitle="From your Connect customer profile.">
      <div class="flex flex-col gap-4">
        <FormMessage message={form.message()} />

        <dl class="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt class="text-base-content/60">Channel</dt>
            <dd class="font-medium">{channelNames[props.contact.channel]}</dd>
          </div>
          <div>
            <dt class="text-base-content/60">Contact hours</dt>
            <dd class="font-medium">{contactHours(props.contact.window)}</dd>
          </div>
        </dl>

        <label class="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 p-3">
          <input
            type="checkbox"
            class="toggle mt-0.5"
            checked={!props.contact.optedOut}
            disabled={form.pending()}
            onChange={(event) => setOptedOut(!event.currentTarget.checked)}
          />
          <span>
            <span class="block font-medium">Send me suggestions</span>
            <span class="text-sm text-base-content/60">
              <Show
                when={!props.contact.optedOut}
                fallback="You've opted out. We won't message you; suggestions wait for you on the dashboard."
              >
                One at a time, within your contact hours.
                <Show when={!props.contact.reachableNow}>
                  {' '}
                  It's outside them now, so the next one waits until{' '}
                  {contactHours(props.contact.window).slice(0, 5)}.
                </Show>
              </Show>
            </span>
          </span>
        </label>

        <Show when={props.contact.sent.length}>
          <div class="flex flex-col gap-2">
            <h3 class="font-medium">Sent messages</h3>
            <p class="text-sm text-base-content/60">
              Text messages, email and app notifications aren't connected in this demo, so they're shown here.
            </p>
            <ul class="list rounded-box border border-base-300">
              <For each={props.contact.sent}>
                {(message) => (
                  <li class="list-row">
                    <div class="text-xs text-base-content/60">
                      <div>{channelNames[message.channel]}</div>
                      <div>{sentAt(message.at, props.contact.timeZone)}</div>
                    </div>
                    <div class="text-sm whitespace-pre-line">{message.body}</div>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </div>
    </Panel>
  );
}
