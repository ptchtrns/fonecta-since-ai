import { describe, expect, test } from 'vite-plus/test';
import { confirmationMessage, suggestionMessage, translateReason } from '~/lib/messages';
import { importanceLabel, importanceScore } from '~/lib/importance';
import { groupWeek } from '~/lib/hours';

const reasons = [
  'Based on what you entered for this day in previous years',
  '39% of similar businesses nearby have told us they close on this day',
  '82% of businesses like yours were closed on this day in earlier years',
  'Kauppakeskus Revontuli has published its hours for this day',
  'Businesses like yours are closed at this time of year',
  'You were closed at this time of year last year',
  'You have been closed at this time of year for the last 2 years',
  'A customer found your doors closed on this day last year',
  'A customer found you already closed at 16:00 on this day last year',
  'A customer found you still closed until 12:00 on this day last year',
  'A customer found you open on this day last year',
  'A Google user reported these hours for 2025-12-24, the last time this day came round',
  'There is unlikely to be enough snow for skiing on this day',
];

describe('translateReason', () => {
  test.each(reasons)('knows "%s" in every language', (reason) => {
    for (const language of ['fi', 'sv', 'nb', 'en'] as const) {
      expect(translateReason(reason, language)).toBeTruthy();
    }
  });
  test('keeps the numbers and names', () => {
    expect(translateReason(reasons[1]!, 'fi')).toContain('39%');
    expect(translateReason(reasons[3]!, 'sv')).toContain('Kauppakeskus Revontuli');
    expect(translateReason(reasons[8]!, 'nb')).toContain('16:00');
  });
  test('unknown reasons are left out rather than sent in the wrong language', () => {
    expect(translateReason('Something new', 'fi')).toBeNull();
  });
});

describe('suggestionMessage', () => {
  test("states the day, what Google shows, the reason and the suggestion, like the brief's example", () => {
    const body = suggestionMessage({
      owner: 'Aleksi',
      dayName: 'Jouluaatto',
      date: '2026-12-24',
      shown: '07:30-18:00',
      suggested: '07:30-13:00',
      reasons: [reasons[0]!],
      url: 'https://x/s/abc',
      language: 'fi',
    });
    expect(body).toContain('Hei Aleksi! Jouluaatto on to 24.12. Google näyttää nyt 07:30–18:00.');
    expect(body).toContain('Perustuu aiempina vuosina');
    expect(body).toContain('*to 24.12. 07:30–13:00*');
    expect(body).toContain('https://x/s/abc');
  });
});

describe('confirmationMessage', () => {
  test('says where the hours now show', () => {
    const sites = [
      { name: 'Google', seconds: 120 },
      { name: 'Apple Maps', seconds: 172_800 },
    ];
    const text = confirmationMessage('closed', '2026-12-25', sites, 'en');
    expect(text).toContain('Fri 25.12. closed');
    expect(text).toContain('Live now on Google.');
    expect(text).toContain('Apple Maps: within 2 d.');
  });
  test("doesn't claim anything went live when nothing was published", () => {
    expect(confirmationMessage('closed', '2026-12-25', null, 'en')).not.toContain('Live');
  });
});

describe('importance', () => {
  test('a busy day beats a quiet one, and a sure guess beats an unsure one', () => {
    const busy = importanceScore({ confidence: 0.7, views: 100, daysUntil: 40 });
    const quiet = importanceScore({ confidence: 0.7, views: 10, daysUntil: 40 });
    const unsure = importanceScore({ confidence: 0.3, views: 100, daysUntil: 40 });
    expect(busy).toBeGreaterThan(quiet);
    expect(busy).toBeGreaterThan(unsure);
  });
  test('coming days count more', () => {
    expect(importanceScore({ confidence: 0.7, views: 50, daysUntil: 3 })).toBeGreaterThan(
      importanceScore({ confidence: 0.7, views: 50, daysUntil: 60 }),
    );
  });
  test('labels are relative to the top suggestion', () => {
    expect(importanceLabel(100, 100)).toBe('high');
    expect(importanceLabel(50, 100)).toBe('medium');
    expect(importanceLabel(10, 100)).toBe('low');
  });
});

test('groupWeek joins days with the same hours', () => {
  expect(
    groupWeek({
      monday: '09:00-17:00',
      tuesday: '09:00-17:00',
      wednesday: '09:00-17:00',
      thursday: '09:00-17:00',
      friday: '09:00-17:00',
      saturday: '10:00-14:00',
      sunday: 'closed',
    }),
  ).toEqual([
    { days: 'Mon – Fri', hours: '09:00-17:00' },
    { days: 'Sat', hours: '10:00-14:00' },
    { days: 'Sun', hours: 'closed' },
  ]);
});
