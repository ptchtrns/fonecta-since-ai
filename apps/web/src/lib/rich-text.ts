// Owner messages are written once, with WhatsApp's formatting (*bold*, _italic_). These turn them into what
// Telegram and email clients show. Everything is escaped first, so a business name can never inject markup.

const escapeHtml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const emphasis = (html: string) =>
  html.replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,!?])/g, '$1<i>$2</i>');

/** Telegram's HTML: bold and italic, line breaks kept as they are. */
export const toHtml = (body: string) => emphasis(escapeHtml(body));

/** The message without WhatsApp's markers, for plain-text email and the outbox. */
export const toPlain = (body: string) => body.replace(/\*([^*\n]+)\*/g, '$1');

const linkify = (html: string) =>
  html.replace(
    /https?:\/\/[^\s<]+[^\s<.,!?)]/g,
    (url) => `<a href="${url}" style="color:#1d4ed8">${url}</a>`,
  );

/** A simple email: one paragraph per block of lines, links clickable, and one button to answer. */
export function toEmailHtml(body: string, cta?: { label: string; url: string }) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((block) => `<p style="margin:0 0 16px">${linkify(toHtml(block)).replaceAll('\n', '<br>')}</p>`)
    .join('');
  const button = cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6"><div style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border-radius:12px;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111827">${paragraphs}${button}</div></body></html>`;
}
