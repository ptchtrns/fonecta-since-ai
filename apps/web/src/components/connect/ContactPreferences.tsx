import { revalidate } from '@solidjs/router';
import { For, Show } from 'solid-js';
import { FormMessage } from '~/components/FormMessage';
import { Panel } from '~/components/connect/Page';
import { MessageSettings } from '~/components/connections/MessageSettings';
import { contactChannels, type ContactChannel } from '~/db/schema';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { getWorkspace, type Workspace } from '~/queries/workspace';

const channelNames: Record<ContactChannel, string> = {
  SMS: 'Text message',
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
  APP_PUSH: 'Connect app notification',
  TELEGRAM: 'Telegram',
};

// Channels the owner can connect on this page; the others aren't connected in this demo.
const connectable: ContactChannel[] = ['WHATSAPP', 'TELEGRAM', 'EMAIL'];

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

/**
 * The owner's contact preferences from their customer record: opt-out and preferred channel, with what goes out in
 * additional options. Also messages on channels this app doesn't send on.
 */
export function ContactPreferences(props: {
  workspace: Workspace;
  register: (unsaved: () => boolean) => void;
}) {
  const contact = () => props.workspace.contact;
  const form = createFormState();
  // Channels turned on below besides the preferred one: they get every message too.
  const alsoOn = () => contact().connected.filter((c) => c !== contact().preferred);

  function save(change: { optedOut?: boolean; preferredChannel?: ContactChannel }) {
    return form.submit(
      async () => (await apiSend('/api/workspace/contact', 'PATCH', change)).message,
      () => revalidate(getWorkspace.key),
    );
  }

  function preferredHint() {
    const preferred = contact().preferred;
    const name = channelNames[preferred];
    if (contact().connected.includes(preferred)) return `Sent on ${name}.`;
    if (connectable.includes(preferred))
      return `${name} isn't connected yet: set it up below. Until then, messages show under Sent messages.`;
    return `${name}s aren't connected in this demo, so messages show under Sent messages.`;
  }

  return (
    <Panel title="How we reach you" subtitle="Your preferences in your Connect customer profile.">
      <div class="flex flex-col gap-4">
        <FormMessage message={form.message()} />

        <label class="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 p-3">
          <input
            type="checkbox"
            class="toggle mt-0.5"
            checked={contact().optedOut}
            disabled={form.pending()}
            onChange={(event) => save({ optedOut: event.currentTarget.checked })}
          />
          <span>
            <span class="block font-medium">Opt out of suggestion messages</span>
            <span class="text-sm text-base-content/60">
              <Show
                when={!contact().optedOut}
                fallback="You've opted out. We won't message you; suggestions wait for you on the dashboard."
              >
                We send one at a time, within your contact hours ({contactHours(contact().window)}).
                <Show when={!contact().reachableNow}>
                  {' '}
                  It's outside them now, so the next one waits until{' '}
                  {contactHours(contact().window).slice(0, 5)}.
                </Show>
              </Show>
            </span>
          </span>
        </label>

        <label class="flex flex-col gap-1.5">
          <span class="font-medium">Preferred channel</span>
          <select
            class="select w-full sm:w-1/2"
            disabled={form.pending()}
            onChange={(event) => save({ preferredChannel: event.currentTarget.value as ContactChannel })}
          >
            <For each={contactChannels}>
              {(channel) => (
                <option value={channel} selected={contact().preferred === channel}>
                  {channelNames[channel]}
                </option>
              )}
            </For>
          </select>
          <span class="text-sm text-base-content/60">
            {preferredHint()}
            <Show when={alsoOn().length}>
              {' '}
              Also sent on{' '}
              {alsoOn()
                .map((c) => channelNames[c])
                .join(' and ')}
              , as you turned on below.
            </Show>
          </span>
        </label>

        <details class="collapse collapse-arrow rounded-box border border-base-300">
          <summary class="collapse-title font-medium">Additional options</summary>
          <div class="collapse-content">
            <MessageSettings workspace={props.workspace} register={props.register} />
          </div>
        </details>

        <Show when={contact().sent.length}>
          <div class="flex flex-col gap-2">
            <h3 class="font-medium">Sent messages</h3>
            <p class="text-sm text-base-content/60">
              Messages on channels that aren't connected, such as text messages and app notifications in this
              demo, or email to your profile's address, are shown here.
            </p>
            <ul class="list rounded-box border border-base-300">
              <For each={contact().sent}>
                {(message) => (
                  <li class="list-row">
                    <div class="text-xs text-base-content/60">
                      <div>{channelNames[message.channel]}</div>
                      <div>{sentAt(message.at, contact().timeZone)}</div>
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
