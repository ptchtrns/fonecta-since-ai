import { describe, expect, test } from 'vite-plus/test';
import { toEmailHtml, toHtml, toPlain } from '~/lib/rich-text';

describe('toHtml', () => {
  test('turns WhatsApp bold and italic into tags', () => {
    expect(toHtml('We suggest: *closed*. _Maybe_ not.')).toBe('We suggest: <b>closed</b>. <i>Maybe</i> not.');
  });
  test('escapes markup before formatting', () => {
    expect(toHtml('*<script>* & co')).toBe('<b>&lt;script&gt;</b> &amp; co');
  });
  test('leaves underscores inside words and URLs alone', () => {
    expect(toHtml('https://x.test/s/a_b_c snake_case_name')).toBe('https://x.test/s/a_b_c snake_case_name');
  });
});

describe('toPlain', () => {
  test('drops bold markers only', () => {
    expect(toPlain('Hi! *Confirm your hours: Christmas Day*')).toBe('Hi! Confirm your hours: Christmas Day');
  });
});

describe('toEmailHtml', () => {
  test('makes paragraphs, line breaks, links and a button', () => {
    const html = toEmailHtml('Hi!\nLine two\n\nEdit: https://app.test/s/abc.', {
      label: 'Answer',
      url: 'https://app.test/s/abc',
    });
    expect(html).toContain('Hi!<br>Line two</p>');
    expect(html).toContain(
      '<a href="https://app.test/s/abc" style="color:#1d4ed8">https://app.test/s/abc</a>.',
    );
    expect(html).toContain('>Answer</a>');
  });
});
