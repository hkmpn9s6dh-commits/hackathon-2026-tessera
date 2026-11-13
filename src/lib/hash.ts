/** SHA-256 over UTF-8 text or raw bytes, using WebCrypto (browser and Node ≥ 20 both have it). */

const enc = new TextEncoder();

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error('fromHex: not hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? enc.encode(value) : value;
}

/** WebCrypto wants BufferSource; a plain Uint8Array is one at runtime. */
export const asSource = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

export async function sha256(input: string | Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', asSource(bytes(input)));
  return new Uint8Array(digest);
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  return toHex(await sha256(input));
}

export function b64url(bytesIn: Uint8Array): string {
  let s = '';
  for (const b of bytesIn) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export const GENESIS = '0'.repeat(64);
