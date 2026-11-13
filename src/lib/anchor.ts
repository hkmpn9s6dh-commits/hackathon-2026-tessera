/**
 * The Arweave anchor packet.
 *
 * Posting to Arweave costs AR and needs a wallet, so this build does not post. What it does is
 * produce the exact bytes and tags an operator would hand to a bundler, plus the data root anyone
 * can recompute from the bundle. That keeps the claim honest: we ship the packet, not a receipt
 * from a network we never touched.
 */

import { b64url, sha256 } from './hash';
import { canonical } from './canonical';
import type { Bundle } from './types';

export type AnchorPacket = {
  protocol: 'arweave';
  dataRoot: string;
  bytes: number;
  contentType: 'application/json';
  tags: { name: string; value: string }[];
  endpoint: string;
  note: string;
};

export async function anchorPacket(bundle: Bundle): Promise<AnchorPacket> {
  // The root is over the canonical form, not the file bytes, so pretty-printing a bundle
  // cannot change what was anchored.
  const raw = new TextEncoder().encode(canonical(bundle as unknown as Record<string, unknown>));
  const dataRoot = b64url(await sha256(raw));
  return {
    protocol: 'arweave',
    dataRoot,
    bytes: raw.length,
    contentType: 'application/json',
    tags: [
      { name: 'App-Name', value: 'Tessera' },
      { name: 'App-Version', value: '1' },
      { name: 'Tessera-Run', value: bundle.run.id },
      { name: 'Tessera-Root', value: bundle.root },
      { name: 'Tessera-Steps', value: String(bundle.steps.length) },
      { name: 'Tessera-Key', value: bundle.run.operator.keyId },
      { name: 'Content-Type', value: 'application/json' },
    ],
    endpoint: 'https://arweave.net/tx',
    note: 'Posting this payload costs AR and needs a wallet. Tessera v1 stops at the packet: anyone can re-hash the bundle and compare with dataRoot.',
  };
}

export async function checkAnchor(bundle: Bundle, packet: AnchorPacket): Promise<boolean> {
  const raw = new TextEncoder().encode(canonical(bundle as unknown as Record<string, unknown>));
  return b64url(await sha256(raw)) === packet.dataRoot;
}
