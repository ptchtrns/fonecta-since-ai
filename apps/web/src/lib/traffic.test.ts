import { describe, expect, test } from 'vite-plus/test';
import { shiftDate } from '~/lib/hours';
import { summarize, type Day } from '~/lib/traffic';

const day = (date: string, views: number): Day => ({
  date,
  searchViews: views,
  mapViews: 0,
  searches: views * 2,
  actions: 1,
  calls: 0,
  profileViews: 0,
});

describe('traffic', () => {
  test('the last 28 days against the 28 before, ending on the latest day', () => {
    const days = Array.from({ length: 91 }, (_, i) => day(shiftDate('2026-08-05', i), i < 63 ? 10 : 15));
    const t = summarize('dataset', days)!;
    expect(t.to).toBe('2026-11-03');
    expect(t.from).toBe('2026-10-07');
    expect(t.totals.views).toBe(28 * 15);
    expect(t.change.views).toBeCloseTo(0.5);
    expect(t.change.calls).toBeNull();
    expect(t.daily).toHaveLength(91);
  });

  test('nothing to show without data', () => {
    expect(summarize('yext', [])).toBeNull();
  });
});
