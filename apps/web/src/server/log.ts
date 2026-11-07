import 'server-only';

// One-line server logs: `[scope] message key=value`. They print in the `pnpm run dev` terminal and reach
// Cloudflare's observability in production, so never pass secrets, tokens, or message and prompt text.

type Level = 'info' | 'warn' | 'error';
/** `error` is printed after the line, so an Error keeps its stack. */
type Fields = Record<string, unknown> & { error?: unknown };

const format = (value: unknown) =>
  typeof value === 'string' && value && !/\s/.test(value) ? value : JSON.stringify(value);

function write(level: Level, scope: string, message: string, { error, ...fields }: Fields = {}) {
  const pairs = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${format(value)}`);
  const line = [`[${scope}]`, message, ...pairs].join(' ');
  if (error === undefined) console[level](line);
  else console[level](line, error);
}

export const log = {
  info: (scope: string, message: string, fields?: Fields) => write('info', scope, message, fields),
  warn: (scope: string, message: string, fields?: Fields) => write('warn', scope, message, fields),
  error: (scope: string, message: string, fields?: Fields) => write('error', scope, message, fields),
};

/** The level a finished HTTP call should log at. */
export const levelFor = (status: number): Level =>
  status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

/** A request path safe to log: no query string, and the no-login token in /s/<token> is hidden. */
export const safePath = (path: string) => path.split('?')[0]!.replace(/^(\/(?:api\/)?s\/)[^/]+/, '$1***');

/** The last four digits are enough to tell owners apart. */
export const maskPhone = (phone: string) => `***${phone.replace(/\D/g, '').slice(-4)}`;
