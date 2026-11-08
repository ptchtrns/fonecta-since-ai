import { revalidate } from '@solidjs/router';
import { createSignal, onSettled, Show } from 'solid-js';
import { FormMessage } from '~/components/FormMessage';
import { Panel } from '~/components/connect/Page';
import { BrandMark } from '~/components/connect/PublisherLogo';
import { apiSend } from '~/lib/api';
import { createFormState } from '~/lib/form';
import { getWorkspace, type Workspace } from '~/queries/workspace';

// How long the page keeps checking for the owner pressing Start in Telegram.
const WAIT_MS = 2 * 60 * 1000;
const EVERY_MS = 3000;

/**
 * Telegram has no address to type in: the owner opens the bot from here and presses Start, which tells the bot
 * which business the chat is for. The page checks back until the chat shows up.
 */
export function TelegramChannel(props: { telegram: Workspace['telegram'] }) {
  const form = createFormState();
  const test = createFormState();
  const [waiting, setWaiting] = createSignal(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    clearInterval(timer);
    timer = undefined;
    setWaiting(false);
  };
  onSettled(() => stop);

  function waitForStart() {
    stop();
    setWaiting(true);
    const until = Date.now() + WAIT_MS;
    timer = setInterval(() => {
      if (props.telegram.connected || Date.now() > until) return stop();
      void revalidate(getWorkspace.key);
    }, EVERY_MS);
  }

  const disconnect = () =>
    form.submit(
      async () => (await apiSend('/api/workspace/telegram', 'DELETE', {})).message,
      () => revalidate(getWorkspace.key),
    );
  const sendTest = () =>
    test.submit(async () => (await apiSend('/api/workspace/telegram/test', 'POST', {})).message);

  return (
    <Panel>
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <BrandMark name="Telegram" class="size-8" />
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold">Telegram</h2>
            <p class="text-sm text-base-content/60">
              Answer suggestions with one tap in a chat with our bot.
            </p>
          </div>
          <Show when={props.telegram.connected}>
            <span class="flex items-center gap-1.5 text-sm font-medium">
              <span class="status status-success" aria-hidden="true" />
              Connected
            </span>
          </Show>
        </div>
        <FormMessage message={form.message()} />

        <Show
          when={props.telegram.configured}
          fallback={
            <p class="rounded-box border border-base-300 bg-base-200 px-4 py-3 text-sm">
              Telegram is off because the <code class="font-mono">TELEGRAM_BOT_TOKEN</code> and{' '}
              <code class="font-mono">TELEGRAM_BOT_USERNAME</code> environment variables aren't set.
            </p>
          }
        >
          <Show
            when={props.telegram.connected}
            fallback={
              <div class="flex flex-wrap items-center justify-between gap-3">
                <p class="text-sm text-base-content/70">
                  <Show
                    when={waiting()}
                    fallback="Opens Telegram. Press Start there, and suggestions come to that chat."
                  >
                    <span class="loading loading-dots loading-xs mr-2 align-middle" />
                    Waiting for you to press Start in Telegram…
                  </Show>
                </p>
                <Show when={props.telegram.connectUrl}>
                  {(url) => (
                    <a
                      href={url()}
                      target="_blank"
                      rel="noreferrer"
                      class="btn btn-primary"
                      onClick={waitForStart}
                    >
                      Connect Telegram
                    </a>
                  )}
                </Show>
              </div>
            }
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-sm">
                Suggestions go to{' '}
                <span class="font-medium">{props.telegram.name ?? 'your Telegram chat'}</span>.
              </p>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="btn btn-ghost border-base-300"
                  disabled={test.pending()}
                  onClick={sendTest}
                >
                  Send test message
                </button>
                <button
                  type="button"
                  class="btn btn-ghost text-error"
                  disabled={form.pending()}
                  onClick={disconnect}
                >
                  Disconnect
                </button>
              </div>
            </div>
            <FormMessage message={test.message()} />
          </Show>
        </Show>
      </div>
    </Panel>
  );
}
