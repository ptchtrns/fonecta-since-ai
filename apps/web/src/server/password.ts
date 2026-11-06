import 'server-only';

// PBKDF2 through WebCrypto. Workers cap PBKDF2 at 100k iterations, and pure-JS scrypt
// (Better Auth's default) can exceed the free plan CPU limit.
const ITERATIONS = 100_000;
const KEY_LENGTH = 32;

const encoder = new TextEncoder();
const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array((hex.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

/** Format: pbkdf2$<iterations>$<salt hex>$<hash hex> */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }) {
  const [scheme, iterations, salt, expected] = hash.split('$');
  if (scheme !== 'pbkdf2' || !iterations || !salt || !expected) return false;
  const actual = await derive(password, fromHex(salt), Number(iterations));
  const expectedBytes = fromHex(expected);
  if (actual.length !== expectedBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expectedBytes[i]!;
  return diff === 0;
}
