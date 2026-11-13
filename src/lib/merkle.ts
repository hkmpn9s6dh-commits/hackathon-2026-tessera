/**
 * Merkle tree over step hashes.
 *
 * Leaf:  sha256(0x00 || stepHashBytes)
 * Node:  sha256(0x01 || left || right)
 * Odd node at any level is promoted unchanged to the next level (no duplication), which makes the
 * tree shape a function of the step count alone and keeps proofs short.
 */

import { fromHex, sha256, toHex } from './hash';

export type Side = 'L' | 'R';
export type PathNode = { side: Side; h: string };

const LEAF = 0x00;
const NODE = 0x01;

function concat(prefix: number, ...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, prefix === 0 ? 0 : 1);
  const out = new Uint8Array(prefix === 0 ? total : total);
  let at = 0;
  if (prefix !== 0) {
    out[at] = prefix;
    at += 1;
  }
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export async function leafHash(stepHashHex: string): Promise<string> {
  const h = await sha256(concat(LEAF, fromHex(stepHashHex)));
  return toHex(h);
}

export async function nodeHash(leftHex: string, rightHex: string): Promise<string> {
  const h = await sha256(concat(NODE, fromHex(leftHex), fromHex(rightHex)));
  return toHex(h);
}

/** Level-by-level build; returns every level (level 0 = leaves) so proofs can reuse it. */
export async function levels(stepHashes: readonly string[]): Promise<string[][]> {
  const out: string[][] = [];
  let level = await Promise.all(stepHashes.map(leafHash));
  out.push(level);
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];
      if (left === undefined) break;
      if (right === undefined) next.push(left);
      else next.push(await nodeHash(left, right));
    }
    out.push(next);
    level = next;
  }
  return out;
}

export async function root(stepHashes: readonly string[]): Promise<string> {
  if (stepHashes.length === 0) return '0'.repeat(64);
  const lv = await levels(stepHashes);
  const top = lv[lv.length - 1];
  return top?.[0] ?? '0'.repeat(64);
}

export async function proof(stepHashes: readonly string[], index: number): Promise<PathNode[]> {
  if (index < 0 || index >= stepHashes.length) throw new Error('proof: index out of range');
  const lv = await levels(stepHashes);
  const path: PathNode[] = [];
  let at = index;
  for (let d = 0; d < lv.length - 1; d += 1) {
    const level = lv[d];
    if (level === undefined) break;
    const sibling = at ^ 1;
    const sib = level[sibling];
    if (sib !== undefined) {
      path.push({ side: (at & 1) === 0 ? 'R' : 'L', h: sib });
    }
    at >>= 1;
  }
  return path;
}

export async function verifyProof(
  stepHashHex: string,
  path: readonly PathNode[],
  expectedRoot: string,
): Promise<boolean> {
  let cur = await leafHash(stepHashHex);
  for (const node of path) {
    cur = node.side === 'L' ? await nodeHash(node.h, cur) : await nodeHash(cur, node.h);
  }
  return cur === expectedRoot;
}
