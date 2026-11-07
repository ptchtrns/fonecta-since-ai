import { describe, expect, test } from 'vite-plus/test';
import { isPublicUrl, readHours } from '~/lib/source-reader';

const TODAY = '2026-11-07';

describe('readHours', () => {
  test('finds numeric dates with hours or closed, in Nordic wording', () => {
    const page = `<ul><li>24.12. suljettu</li><li>25.12 kiinni</li><li>31.12. klo 10-15</li><li>1.1.2027 stängt</li></ul>`;
    expect(readHours(page, TODAY)).toEqual({
      '2026-12-24': 'closed',
      '2026-12-25': 'closed',
      '2026-12-31': '10:00-15:00',
      '2027-01-01': 'closed',
    });
  });

  test('reads month names and dotted times', () => {
    expect(readHours('December 24: 9.30–13.00. 26 desember stengt', TODAY)).toEqual({
      '2026-12-24': '09:30-13:00',
      '2026-12-26': 'closed',
    });
  });

  test('keeps a lunch break as two intervals', () => {
    expect(readHours('6.12. 11-14 ja 17-22', TODAY)).toEqual({ '2026-12-06': '11:00-14:00,17:00-22:00' });
  });

  test('recognises holiday names', () => {
    expect(readHours('Jouluaatto: suljettu', TODAY, { jouluaatto: '2026-12-24' })).toEqual({
      '2026-12-24': 'closed',
    });
  });

  test('does not take clock times for dates, or weekly hours for a date', () => {
    expect(readHours('Avoinna ma-pe 9.30-15.00, la 10.00-14.00', TODAY)).toEqual({});
  });

  test('ignores hours far from the date, and scripts', () => {
    const filler = 'x'.repeat(80);
    expect(readHours(`24.12. ${filler} suljettu`, TODAY)).toEqual({});
    expect(readHours('<script>var a = "24.12. closed"</script>', TODAY)).toEqual({});
  });

  test('a date earlier in the year means next year', () => {
    expect(readHours('6.1. closed', TODAY)).toEqual({ '2027-01-06': 'closed' });
  });
});

describe('isPublicUrl', () => {
  test.each(['https://kahvila.fi/aukiolo', 'http://example.com'])('allows %s', (url) => {
    expect(isPublicUrl(url)).toBe(true);
  });
  test.each([
    'http://localhost:3000',
    'http://192.168.1.1',
    'http://10.0.0.1',
    'ftp://a.fi',
    'http://[::1]',
    'nope',
  ])('blocks %s', (url) => {
    expect(isPublicUrl(url)).toBe(false);
  });
});
