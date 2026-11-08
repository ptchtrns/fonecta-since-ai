// Shapes shared by the copilot's server and its panel. See docs/COPILOT.md.
import type {
  CopilotDiffRow,
  CopilotMessageRole,
  CopilotMessageStatus,
  CopilotPreviewStatus,
} from '~/db/schema';

export const CONTEXT_VERSION = '1';

/**
 * What the signed-in account may do, worked out by the server from the session on every request. The model is told
 * these so it doesn't propose what would be refused, but they are checked again when a tool runs and on commit.
 */
export const capabilities = [
  'business.read',
  'business.update',
  'hours.update',
  'suggestions.answer',
  'edits.answer',
  'messages.update',
  'contact.update',
] as const;
export type Capability = (typeof capabilities)[number];

/** Pages the copilot knows. Anything else the browser sends is recorded as null. */
export const copilotRoutes = [
  '/dashboard',
  '/dashboard/company',
  '/dashboard/visibility',
  '/dashboard/reports',
  '/dashboard/connections',
  '/dashboard/account',
] as const;
export type CopilotRoute = (typeof copilotRoutes)[number];

/** What the owner had selected when asking: an id only. The server looks the record up itself. */
export type CopilotSelection =
  | { type: 'suggestion'; key: string }
  | { type: 'google_edit'; id: string }
  | null;

export type PreviewView = {
  id: string;
  operation: string;
  title: string;
  diff: CopilotDiffRow[];
  effects: string[];
  status: CopilotPreviewStatus;
  expiresAt: string;
  resultMessage: string | null;
};

export type MessageView = {
  id: string;
  seq: number;
  role: CopilotMessageRole;
  content: string;
  status: CopilotMessageStatus;
  model: string | null;
  createdAt: string;
  previews: PreviewView[];
};

export type ConversationView = { id: string; title: string; messages: MessageView[] };

/** Operation names as the owner sees them on a preview. */
export const operationTitles: Record<string, string> = {
  propose_business_details: 'Change business details',
  propose_weekly_hours: 'Change opening hours',
  propose_suggestion_answer: 'Answer a suggestion',
  propose_google_edit_answer: 'Answer a suggested edit',
  propose_message_settings: 'Change message settings',
  propose_contact_preferences: 'Change contact preferences',
};
