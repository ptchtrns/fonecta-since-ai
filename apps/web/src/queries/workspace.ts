import { query } from '@solidjs/router';
import { apiGet, type Jsonify } from '~/lib/api';
import type { WorkspaceData } from '~/services/workspace.service';

export type Workspace = Jsonify<WorkspaceData>;
export type SuggestionItem = Workspace['suggestions']['pending'][number];

/** Everything the dashboard shows. Null until the account has chosen a business. */
export const getWorkspace = query(() => apiGet<Workspace | null>('/api/workspace'), 'workspace');

export type OwnerSuggestion = {
  business: { name: string; owner: string };
  date: string;
  status: 'pending' | 'approved' | 'edited' | 'declined';
  hours: string | null;
  snapshot: {
    label: string;
    shown: string;
    suggested: string | null;
    confidence: number | null;
    reasons: string[];
  };
  open: boolean;
  views: number | null;
  sites: { name: string; seconds: number | null }[] | null;
};

/** One suggestion, for the no-login link. */
export const getOwnerSuggestion = query(
  (token: string) => apiGet<OwnerSuggestion>(`/api/s/${token}`),
  'owner-suggestion',
);
