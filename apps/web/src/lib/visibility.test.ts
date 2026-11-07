import { describe, expect, test } from 'vite-plus/test';
import { suggestionStats } from '~/lib/report';
import {
  aiReport,
  formatDuration,
  listingsSummary,
  nextStep,
  opening,
  openingLine,
  pointsToGain,
  profileReport,
  searchReport,
  speedGroups,
  type Facts,
  type ListingSite,
} from '~/lib/visibility';

const site = (publisherId: string, seconds: number, extra: Partial<ListingSite> = {}): ListingSite => ({
  publisherId,
  name: publisherId,
  logo: publisherId,
  status: 'LIVE',
  live: true,
  needsAccount: false,
  seconds,
  ...extra,
});

// Business Lunch House as the Yext sandbox has it: no website, no reviews, Google not linked.
const lunchHouse: Facts = {
  name: 'Business Lunch House',
  category: 'Lunch restaurant',
  city: 'Tampere',
  addressLine1: 'Hämeenkatu 25',
  phone: '+358466889909',
  website: '',
  description:
    'Home-style lunch buffet in the heart of Tampere, on Hämeenkatu. Soup, salad and two warm dishes every weekday.',
  timezone: 'Europe/Helsinki',
  hours: {
    monday: 'closed',
    tuesday: 'closed',
    wednesday: '10:30-14:30',
    thursday: '10:30-14:30',
    friday: '10:30-14:30',
    saturday: 'closed',
    sunday: 'closed',
  },
  holidayHours: [
    { date: '2026-12-24', hours: '10:30-14:00' },
    { date: '2026-12-25', hours: 'closed' },
  ],
  missingHolidays: [],
  listings: [
    site('GOOGLEMYBUSINESS', 120, { needsAccount: true }),
    site('FACEBOOK', 600, { needsAccount: true }),
    site('BING', 86_400),
    site('FOURSQUARE', 604_800),
  ],
  reviews: { count: 0, averageRating: 0 },
};

describe('reports', () => {
  test('profile strength misses only the website', () => {
    const report = profileReport(lunchHouse);
    expect(report.score).toBe(90);
    expect(report.checks.filter((c) => !c.done).map((c) => c.key)).toEqual(['website']);
  });

  test('local search score', () => {
    const report = searchReport(lunchHouse);
    expect(report.score).toBe(55);
    expect(pointsToGain(report.checks)).toBe(45);
    expect(report.checks.filter((c) => !c.done).map((c) => c.key)).toEqual([
      'description',
      'website',
      'reviews',
      'google',
    ]);
  });

  test('every report adds up to 100 when everything is done', () => {
    const complete: Facts = {
      ...lunchHouse,
      website: 'https://lunch.fi',
      description: `${lunchHouse.description} `.repeat(3),
      listings: [site('GOOGLEMYBUSINESS', 120), site('BING', 86_400), site('APPLE', 172_800)],
      reviews: { count: 12, averageRating: 4.5 },
    };
    expect(profileReport(complete).score).toBe(100);
    expect(searchReport(complete).score).toBe(100);
    expect(aiReport(complete).score).toBe(100);
  });

  test('missing holidays fail the holiday checks', () => {
    const facts = { ...lunchHouse, missingHolidays: [{ date: '2026-12-06', label: 'Independence Day' }] };
    expect(profileReport(facts).checks.find((c) => c.key === 'holidays')?.done).toBe(false);
  });

  test('the next step is the biggest missing item, one the owner can fix first', () => {
    expect(nextStep(searchReport(lunchHouse).checks)?.key).toBe('description');
  });
});

describe('AI answers', () => {
  test('open now, in the business’s time zone', () => {
    // Wednesday 11:00 in Helsinki.
    const { answers } = aiReport(lunchHouse, new Date('2026-11-11T09:00:00Z'));
    expect(answers[0]!.answer).toBe('Yes, it’s open until 14:30 today.');
  });

  test('closed now names the next opening', () => {
    // Saturday noon in Helsinki.
    const { answers } = aiReport(lunchHouse, new Date('2026-11-14T10:00:00Z'));
    expect(answers[0]!.answer).toBe('No, it’s closed right now. It opens on Wednesday at 10:30.');
  });

  test('opening line for the Google preview', () => {
    const at = (iso: string) => openingLine(opening(lunchHouse.hours, lunchHouse.timezone, new Date(iso)));
    expect(at('2026-11-11T09:00:00Z')).toBe('Open · Closes 14:30');
    expect(at('2026-11-11T06:00:00Z')).toBe('Closed · Opens 10:30');
    expect(at('2026-11-14T10:00:00Z')).toBe('Closed · Opens Wed 10:30');
  });

  test('Christmas Day comes from holiday hours', () => {
    const { answers } = aiReport(lunchHouse, new Date('2026-11-11T09:00:00Z'));
    expect(answers[1]!.answer).toBe('It’s closed on Christmas Day.');
  });
});

describe('listings', () => {
  test('summary and update speeds', () => {
    const listings = [
      ...lunchHouse.listings,
      site('TRIPADVISOR', 259_200, { status: 'OPTED_OUT', live: false }),
    ];
    expect(listingsSummary(listings)).toEqual({
      live: 4,
      total: 5,
      needsAccount: 2,
      slowestSeconds: 604_800,
    });
    expect(speedGroups(listings).map((g) => g.sites.length)).toEqual([2, 1, 1]);
    expect(formatDuration(604_800)).toBe('7 days');
    expect(formatDuration(7200)).toBe('2 hours');
  });
});

describe('suggestionStats', () => {
  test('counts the owner’s answers apart from automatic ones', () => {
    const stats = suggestionStats(2, [
      { status: 'approved', via: 'whatsapp', publishedAt: '2026-11-01T10:00:00Z' },
      { status: 'edited', via: 'dashboard', publishedAt: '2026-11-02T10:00:00Z' },
      { status: 'declined', via: 'link', publishedAt: null },
      { status: 'approved', via: 'standing', publishedAt: '2026-11-03T10:00:00Z' },
    ]);
    expect(stats).toMatchObject({
      suggested: 6,
      answered: 4,
      published: 3,
      publishedAfterEdit: 1,
      declined: 1,
      automatic: 1,
    });
    expect(stats.yesRate).toBeCloseTo(2 / 3);
  });

  test('no rate before the first answer', () => {
    expect(suggestionStats(1, []).yesRate).toBeNull();
  });
});
