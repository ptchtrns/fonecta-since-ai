import { describe, expect, test } from 'vite-plus/test';
import { inContactWindow } from '~/lib/contact-window';

// 7 Nov 2026: Helsinki is UTC+2.
const at = (utc: string) => new Date(`2026-11-07T${utc}:00Z`);

describe('inContactWindow', () => {
  test('uses the time zone of the business', () => {
    expect(inContactWindow('12-16', 'Europe/Helsinki', at('10:30'))).toBe(true); // 12:30 in Helsinki
    expect(inContactWindow('12-16', 'Europe/Stockholm', at('10:30'))).toBe(false); // 11:30 in Stockholm
  });
  test('the end hour is not included', () => {
    expect(inContactWindow('08-10', 'Europe/Helsinki', at('07:59'))).toBe(true); // 09:59
    expect(inContactWindow('08-10', 'Europe/Helsinki', at('08:00'))).toBe(false); // 10:00
  });
  test('an unreadable window holds nothing back', () => {
    expect(inContactWindow('any time', 'Europe/Helsinki', at('03:00'))).toBe(true);
  });
});
