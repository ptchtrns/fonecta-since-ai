// Text that reaches the model from places the owner or strangers control: business names and descriptions, reviews,
// suggestion reasons, linked pages' findings, and the owner's own messages. It's cleaned and bounded here, and the
// prompt marks it as data. None of this is what keeps the app safe: the model can only call allowlisted tools, the
// server checks every call, and nothing changes without the owner confirming a preview.

/** Markers the prompt uses around data. Text that imitates them is defused. */
export const DATA_OPEN = '<<<DATA';
export const DATA_CLOSE = 'DATA>>>';

// Control characters other than newline and tab, plus zero-width and bidi overrides that can hide text.
// oxlint-disable-next-line no-control-regex -- matching them is the point
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g;

/** One line or paragraph of untrusted text, at most `max` characters. */
export function cleanText(value: unknown, max: number): string {
  if (value === null || value === undefined) return '';
  let text = String(value)
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/<<<|>>>/g, '‹‹')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length > max) text = `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
  return text;
}

// Phrases that try to steer a model. Finding one doesn't block anything; it's logged, and the text stays data.
const INJECTION = [
  /ignore (all |any )?(the )?(previous|prior|above|earlier) (instructions|messages|rules)/i,
  /disregard (all |any )?(the )?(previous|prior|above|system)/i,
  /\byou are now\b/i,
  /\bsystem prompt\b/i,
  /\bnew instructions\b/i,
  /\b(act|behave) as (an? )?(admin|administrator|developer|system)/i,
  /\bcall (the )?(tool|function)\b/i,
  /\bpropose_[a-z_]+\b/,
  /<\/?(system|assistant|tool|instructions?)>/i,
];

export const looksLikeInjection = (text: string) => INJECTION.some((pattern) => pattern.test(text));

/**
 * Masks contact details in text written by third parties (reviews, linked pages): email addresses and long digit
 * runs such as phone or card numbers. The business's own listed phone is passed as a field, not through here.
 */
export function maskThirdPartyText(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]').replace(/\+?\d[\d \-()]{7,}\d/g, '[number]');
}

/** The host of a linked page, e.g. "facebook.com", rather than its full address with tracking parameters. */
export function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
