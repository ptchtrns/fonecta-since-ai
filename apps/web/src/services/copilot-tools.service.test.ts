import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';
import { hashValues } from '~/lib/copilot/diff';
import { capabilities as ALL, type Capability } from '~/lib/copilot/types';
import type { Snapshot } from '~/services/copilot-context.service';

// The registry is what stands between the model and the domain services, so it's tested on its own: the services
// that would reach D1 and Yext are mocked, and the tests check what the server lets through.

const saveBusiness = vi.fn();
const decide = vi.fn();
vi.mock('~/services/business.service', () => ({ getBusiness: vi.fn(async () => null), saveBusiness }));
vi.mock('~/services/contact.service', () => ({
  saveContact: vi.fn(),
  saveMessageSettings: vi.fn(),
  sendNext: vi.fn(),
  usesOwnChannel: () => false,
}));
vi.mock('~/services/edits.service', () => ({ answerEdit: vi.fn() }));
vi.mock('~/services/suggestions.service', () => ({ decide, FLAG_KEY: 'closed-for-good' }));
vi.mock('~/services/copilot-context.service', () => ({
  selectedRecord: () => null,
  showHours: (t: string) => t,
}));

const { authorize, findProposeTool, toolsFor } = await import('~/services/copilot-tools.service');

const week = (text: string) => ({
  isClosed: text === 'closed',
  openIntervals: text === 'closed' ? [] : [{ start: text.slice(0, 5), end: text.slice(6) }],
});

function snapshot(overrides: { description?: string; monday?: string; publishing?: boolean } = {}): Snapshot {
  const business = {
    id: 'FI-D0017',
    source: 'dataset',
    name: 'Kahvila Kipinä',
    phone: '+358401234567',
    website: 'kipina.fi',
    description: overrides.description ?? 'Cosy café in Tampere.',
    addressLine1: 'Hämeenkatu 1',
    postalCode: '33100',
    city: 'Tampere',
    hours: {
      monday: week(overrides.monday ?? '08:00-17:00'),
      tuesday: week('08:00-17:00'),
      wednesday: week('08:00-17:00'),
      thursday: week('08:00-17:00'),
      friday: week('08:00-17:00'),
      saturday: week('10:00-15:00'),
      sunday: week('closed'),
    },
    contact: { language: 'fi', standingPermission: false, optedOut: false, channel: 'WHATSAPP' },
    whatsapp: { minImportance: 'low' },
  };
  return {
    business,
    publishing: overrides.publishing ?? false,
    presence: { listings: [{ live: true }, { live: false }], googleEdits: [] },
    suggestions: {
      pending: [
        {
          key: '2026-12-25',
          kind: 'hours',
          label: 'Christmas Day',
          date: '2026-12-25',
          shown: '08:00-17:00',
          suggested: 'closed',
          confidence: 0.65,
          checks: [{ kind: 'facebook', hours: '10:00-14:00', agrees: false }],
        },
      ],
      handled: [{ key: '2026-12-24' }],
    },
  } as unknown as Snapshot;
}

const ctx = (s = snapshot(), caps: Capability[] = [...ALL]) => ({
  owner: { userId: 'u1', entityId: 'FI-D0017' },
  capabilities: caps,
  origin: 'https://example.test',
  snapshot: s,
});

beforeEach(() => {
  saveBusiness.mockReset();
  decide.mockReset();
});

describe('authorize', () => {
  test('refuses tools that are not on the allowlist', () => {
    const [error] = authorize('run_sql', { query: 'DROP TABLE user' }, [...ALL]);
    expect(error?.reason).toBe('UnknownTool');
    expect(authorize('fetch_url', { url: 'https://evil.test' }, [...ALL])[0]?.reason).toBe('UnknownTool');
  });

  test('refuses a tool the account lacks the capability for', () => {
    const [error] = authorize('propose_weekly_hours', { hours: { monday: 'closed' } }, ['business.read']);
    expect(error?.reason).toBe('NotAllowed');
  });

  test('refuses unknown fields: the model cannot widen what an edit touches', () => {
    const [error] = authorize('propose_business_details', { name: 'X', city: 'Helsinki' }, [...ALL]);
    expect(error?.reason).toBe('InvalidArguments');
  });

  test('refuses an entity id in the arguments: the business always comes from the session', () => {
    const [error] = authorize('propose_business_details', { name: 'X', entityId: 'SE-D0008' }, [...ALL]);
    expect(error?.reason).toBe('InvalidArguments');
  });

  test('validates values with the same rules as the dashboard’s forms', () => {
    expect(authorize('propose_weekly_hours', { hours: { monday: '9-5' } }, [...ALL])[0]?.reason).toBe(
      'InvalidArguments',
    );
    expect(authorize('propose_business_details', { phone: 'call me' }, [...ALL])[0]?.reason).toBe(
      'InvalidArguments',
    );
    expect(authorize('propose_business_details', { description: 'x'.repeat(601) }, [...ALL])[0]?.reason).toBe(
      'InvalidArguments',
    );
    expect(authorize('propose_business_details', {}, [...ALL])[0]?.reason).toBe('InvalidArguments');
    expect(
      authorize('propose_suggestion_answer', { key: '2026-12-25', action: 'edit' }, [...ALL])[0]?.reason,
    ).toBe('InvalidArguments');
  });

  test('lets a valid request through, typed by kind', () => {
    const [error, ok] = authorize('get_visibility', { area: 'profile' }, ['business.read']);
    expect(error).toBeNull();
    expect(ok?.kind).toBe('read');
    expect(authorize('propose_weekly_hours', { hours: { monday: 'closed' } }, [...ALL])[1]?.kind).toBe(
      'propose',
    );
  });

  test('the prompt only offers what the account may use', () => {
    const names = toolsFor(['business.read']).map((t) => t.name);
    expect(names).toContain('get_visibility');
    expect(names.some((n) => n.startsWith('propose_'))).toBe(false);
    expect(toolsFor([])).toEqual([]);
  });
});

describe('proposals change nothing', () => {
  test('a business details preview shows only the fields that change', async () => {
    const tool = findProposeTool('propose_business_details')!;
    const [error, proposal] = await tool.prepare(ctx(), {
      name: 'Kahvila Kipinä',
      description: 'Cosy café in central Tampere with homemade pastries.',
    });
    expect(error).toBeNull();
    expect(proposal!.diff.map((d) => d.field)).toEqual(['description']);
    expect(proposal!.payload).toEqual({
      description: 'Cosy café in central Tampere with homemade pastries.',
    });
    expect(proposal!.effects[0]).toMatch(/goes live once publishing/);
    expect(saveBusiness).not.toHaveBeenCalled();
  });

  test('says so when nothing would change', async () => {
    const tool = findProposeTool('propose_business_details')!;
    const [error] = await tool.prepare(ctx(), { name: 'Kahvila Kipinä' });
    expect(error?.reason).toBe('NoChange');
  });

  test('weekly hours: per-day rows, other days untouched', async () => {
    const tool = findProposeTool('propose_weekly_hours')!;
    const [, proposal] = await tool.prepare(ctx(snapshot({ publishing: true })), {
      hours: { monday: 'closed', tuesday: '08:00-17:00' },
    });
    expect(proposal!.diff).toEqual([
      { field: 'monday', label: 'Monday', before: '08:00–17:00', after: 'Closed' },
    ]);
    expect(proposal!.payload).toEqual({ hours: { monday: 'closed' } });
    expect(proposal!.effects[0]).toMatch(/Published to Yext/);
  });

  test('a suggestion answer warns about a disagreeing linked page', async () => {
    const tool = findProposeTool('propose_suggestion_answer')!;
    const [, proposal] = await tool.prepare(ctx(), { key: '2026-12-25', action: 'approve' });
    expect(proposal!.diff[0]).toMatchObject({ before: '08:00–17:00', after: 'Closed' });
    expect(proposal!.effects.some((e) => e.includes('facebook') && e.includes('10:00-14:00'))).toBe(true);
    expect(decide).not.toHaveBeenCalled();
  });

  test('refuses the closed-for-good question and answered or unknown days', async () => {
    const tool = findProposeTool('propose_suggestion_answer')!;
    expect(
      authorize('propose_suggestion_answer', { key: 'closed-for-good', action: 'approve' }, [...ALL])[0]
        ?.reason,
    ).toBe('InvalidArguments');
    expect((await tool.prepare(ctx(), { key: '2026-12-24', action: 'approve' }))[0]?.reason).toBe(
      'AlreadyAnswered',
    );
    expect((await tool.prepare(ctx(), { key: '2027-01-06', action: 'approve' }))[0]?.reason).toBe('NotFound');
  });
});

describe('stale previews', () => {
  const baseHash = (s: Snapshot, payload: Record<string, unknown>) =>
    hashValues(findProposeTool('propose_business_details')!.base(s, payload));

  test('the base is the same while the touched fields are', async () => {
    const payload = { description: 'New text' };
    expect(await baseHash(snapshot(), payload)).toBe(await baseHash(snapshot({ monday: 'closed' }), payload));
  });

  test('and changes when a touched field changed since the preview', async () => {
    const payload = { description: 'New text' };
    expect(await baseHash(snapshot(), payload)).not.toBe(
      await baseHash(snapshot({ description: 'Edited on the page meanwhile' }), payload),
    );
  });
});

describe('commit goes through the domain service', () => {
  test('weekly hours are saved with the rest of the card as it is now', async () => {
    saveBusiness.mockResolvedValue([null, { changed: true, published: false }]);
    const tool = findProposeTool('propose_weekly_hours')!;
    const [error, result] = await tool.commit(ctx(), { hours: { monday: 'closed' } });
    expect(error).toBeNull();
    expect(result!.message).toMatch(/Saved/);
    const [entityId, input] = saveBusiness.mock.calls[0]!;
    expect(entityId).toBe('FI-D0017');
    expect(input.hours.monday).toBe('closed');
    expect(input.hours.tuesday).toBe('08:00-17:00');
    expect(input.name).toBe('Kahvila Kipinä');
  });

  test('a Yext refusal is reported, not hidden', async () => {
    saveBusiness.mockResolvedValue([{ reason: 'YextRejected', message: 'Field not supported' }, null]);
    const tool = findProposeTool('propose_business_details')!;
    const [error] = await tool.commit(ctx(), { website: 'kipina.com' });
    expect(error).toMatchObject({ reason: 'YextRejected' });
    expect(error!.message).toContain('Field not supported');
  });

  test('a suggestion answer is recorded as coming from the copilot', async () => {
    decide.mockResolvedValue([null, { decision: { status: 'approved', hours: 'closed', sites: null } }]);
    const tool = findProposeTool('propose_suggestion_answer')!;
    await tool.commit(ctx(), { key: '2026-12-25', action: 'approve' });
    expect(decide).toHaveBeenCalledWith(
      'FI-D0017',
      '2026-12-25',
      { action: 'approve', hours: undefined },
      'copilot',
    );
  });
});
