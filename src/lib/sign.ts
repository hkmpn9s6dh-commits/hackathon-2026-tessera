/** Operator keys and the signature over a run. ECDSA P-256 / SHA-256, WebCrypto only. */

import { canonical } from './canonical';
import { asSource, b64url, fromB64url, sha256Hex } from './hash';
import type { Operator, Sig } from './types';

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

export type Signer = Operator & { privateKey: CryptoKey };

export async function generateOperator(): Promise<Signer> {
  const pair = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const keyId = (await sha256Hex(canonical(publicKeyJwk))).slice(0, 16);
  return { keyId, publicKeyJwk, privateKey: pair.privateKey };
}

export function message(runId: string, root: string): string {
  return `tessera/v1|${runId}|${root}`;
}

export async function signRoot(privateKey: CryptoKey, runId: string, root: string, keyId: string): Promise<Sig> {
  const raw = new Uint8Array(
    await crypto.subtle.sign(SIGN, privateKey, asSource(new TextEncoder().encode(message(runId, root)))),
  );
  return { alg: 'ECDSA-P256-SHA256', keyId, value: b64url(raw) };
}

export async function verifyRoot(publicKeyJwk: JsonWebKey, runId: string, root: string, sig: Sig): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('jwk', publicKeyJwk, ALG, false, ['verify']);
    return await crypto.subtle.verify(SIGN, key, asSource(fromB64url(sig.value)), asSource(new TextEncoder().encode(message(runId, root))));
  } catch {
    return false;
  }
}
