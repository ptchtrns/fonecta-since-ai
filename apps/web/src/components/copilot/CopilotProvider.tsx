import { revalidate } from '@solidjs/router';
import { createContext, createStore, useContext, type ParentProps } from 'solid-js';
import { ApiError, apiGet, apiRequest, apiSend } from '~/lib/api';
import type { ConversationView, CopilotSelection, PreviewView } from '~/lib/copilot/types';
import { getWorkspace } from '~/queries/workspace';

// The copilot's conversation state for the dashboard. Created per mount through context, so server rendering never
// shares one owner's conversation with another request. The server is the source of truth: after each call the
// conversation is replaced with what it returned.

type Notice = { type: 'success' | 'error'; text: string };

type State = {
  open: boolean;
  loaded: boolean;
  enabled: boolean;
  conversation: ConversationView | null;
  /** The message on its way, shown until the server's copy arrives. */
  outgoing: string | null;
  error: string | null;
  /** A message that failed to send, kept with its id so a retry is recognised as the same message. */
  failed: { text: string; clientMessageId: string } | null;
  selection: CopilotSelection;
  /** Previews with a confirm or cancel on its way. */
  working: string[];
  notices: Record<string, Notice>;
};

const newId = () => crypto.randomUUID().replaceAll('-', '');

function createCopilot() {
  const [state, setState] = createStore<State>({
    open: false,
    loaded: false,
    enabled: true,
    conversation: null,
    outgoing: null,
    error: null,
    failed: null,
    selection: null,
    working: [],
    notices: {},
  });
  let controller: AbortController | null = null;
  // One key per preview, reused if the owner presses Confirm again after a dropped connection.
  const confirmKeys = new Map<string, string>();

  async function load() {
    try {
      const data = await apiGet<{ enabled: boolean; conversation: ConversationView | null }>('/api/copilot');
      setState((s) => {
        s.enabled = data.enabled;
        s.conversation = data.conversation;
        s.loaded = true;
      });
    } catch {
      setState((s) => {
        s.loaded = true;
      });
    }
  }

  async function send(text: string, clientMessageId = newId()) {
    const message = text.trim();
    if (!message || state.outgoing !== null) return;
    controller = new AbortController();
    setState((s) => {
      s.outgoing = message;
      s.error = null;
      s.failed = null;
    });
    try {
      const { data } = await apiRequest<ConversationView>('/api/copilot/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: state.conversation?.id ?? null,
          clientMessageId,
          message,
          page: {
            route: window.location.pathname,
            tab: new URLSearchParams(window.location.search).get('tab'),
            selection: state.selection,
          },
        }),
        signal: controller.signal,
      });
      setState((s) => {
        s.conversation = data ?? s.conversation;
        s.selection = null;
      });
    } catch (error) {
      if (controller?.signal.aborted) return;
      setState((s) => {
        s.error =
          error instanceof ApiError ? error.message : 'Connecta AI didn’t answer. Check your connection.';
        // Network failures and server errors can be retried as the same message; refusals can't.
        if (!(error instanceof ApiError) || error.status >= 500)
          s.failed = { text: message, clientMessageId };
      });
    } finally {
      controller = null;
      setState((s) => {
        s.outgoing = null;
      });
    }
  }

  async function stop() {
    controller?.abort();
    const id = state.conversation?.id;
    if (id) await apiSend(`/api/copilot/conversations/${id}/cancel`, 'POST', {}).catch(() => undefined);
    await load();
  }

  function replacePreview(view: PreviewView) {
    setState((s) => {
      for (const m of s.conversation?.messages ?? [])
        for (const p of m.previews) if (p.id === view.id) Object.assign(p, view);
    });
  }

  async function settlePreview(preview: PreviewView, action: 'confirm' | 'cancel') {
    if (state.working.includes(preview.id)) return;
    setState((s) => {
      s.working.push(preview.id);
      delete s.notices[preview.id];
    });
    try {
      const key = confirmKeys.get(preview.id) ?? newId();
      confirmKeys.set(preview.id, key);
      const body = action === 'confirm' ? { idempotencyKey: key } : {};
      const { data, message } = await apiSend<PreviewView>(
        `/api/copilot/previews/${preview.id}/${action}`,
        'POST',
        body,
      );
      if (data) replacePreview(data);
      setState((s) => {
        s.notices[preview.id] = { type: 'success', text: message ?? 'Done.' };
      });
      if (action === 'confirm') {
        // The dashboard behind the panel shows the change, and the conversation gets its confirmation note.
        await Promise.all([revalidate(getWorkspace.key), load()]);
      }
    } catch (error) {
      if (error instanceof ApiError && error.body.data) replacePreview(error.body.data as PreviewView);
      setState((s) => {
        s.notices[preview.id] = {
          type: 'error',
          text: error instanceof ApiError ? error.message : 'Couldn’t reach Connecta AI. Try again.',
        };
      });
    } finally {
      setState((s) => {
        s.working = s.working.filter((id) => id !== preview.id);
      });
    }
  }

  return {
    state,
    /** Opens the panel, optionally about a record on the page and with a question to send. */
    async openPanel(options: { selection?: CopilotSelection; ask?: string } = {}) {
      setState((s) => {
        s.open = true;
        if (options.selection !== undefined) s.selection = options.selection;
      });
      if (!state.loaded) await load();
      if (options.ask) await send(options.ask);
    },
    close: () =>
      setState((s) => {
        s.open = false;
      }),
    send: (text: string) => send(text),
    retry: () => (state.failed ? send(state.failed.text, state.failed.clientMessageId) : Promise.resolve()),
    stop,
    confirm: (preview: PreviewView) => settlePreview(preview, 'confirm'),
    cancel: (preview: PreviewView) => settlePreview(preview, 'cancel'),
    clearSelection: () =>
      setState((s) => {
        s.selection = null;
      }),
    /** Starts over: the next message opens a new conversation. The old one stays until retention removes it. */
    startOver: () =>
      setState((s) => {
        s.conversation = null;
        s.error = null;
        s.failed = null;
        s.notices = {};
      }),
    async remove() {
      const id = state.conversation?.id;
      if (!id) return;
      await apiRequest(`/api/copilot/conversations/${id}`, { method: 'DELETE' }).catch(() => undefined);
      setState((s) => {
        s.conversation = null;
        s.notices = {};
      });
    },
  };
}

export type Copilot = ReturnType<typeof createCopilot>;

const CopilotContext = createContext<Copilot | null>(null);

export function CopilotProvider(props: ParentProps) {
  return <CopilotContext value={createCopilot()}>{props.children}</CopilotContext>;
}

/** The copilot, or null outside the dashboard. */
export const useCopilot = () => useContext(CopilotContext);
