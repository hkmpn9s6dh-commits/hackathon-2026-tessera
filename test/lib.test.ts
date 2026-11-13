import { describe, expect, it } from 'vitest';
import { courierRun } from '../src/agent/agent';
import { anchorPacket, checkAnchor } from '../src/lib/anchor';
import { byteLength, forgeSignature, sealRun, serialise, tamperWith, verifyBundle } from '../src/lib/bundle';
import { canonical } from '../src/lib/canonical';
import { commitments, inspect, stepHash } from '../src/lib/chain';
import { GENESIS } from '../src/lib/hash';
import * as merkle from '../src/lib/merkle';
import { makeProof, verifyProof } from '../src/lib/proof';
import { generateOperator } from '../src/lib/sign';
import type { Bundle } from '../src/lib/types';

describe('canonical json', () => {
  it('sorts keys and drops whitespace', () => {
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });

  it('keeps string bytes as written (no normalisation)', () => {
    expect(canonical('é')).toBe('"é"');
    // A decomposed e + combining acute stays decomposed: the format commits to bytes, not glyphs.
    expect(canonical('e\u0301')).toBe('"e\u0301"');
    expect(canonical('e\u0301')).not.toBe(canonical('é'));
  });

  it('refuses values it cannot encode instead of writing null', () => {
    expect(() => canonical({ a: undefined })).toThrow();
    expect(() => canonical([Number.NaN])).toThrow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonical(cyclic)).toThrow();
  });
});

describe('merkle', () => {
  const leaves = ['00'.repeat(31) + '01', '00'.repeat(31) + '02', '00'.repeat(31) + '03', '00'.repeat(31) + '04', '00'.repeat(31) + '05'];

  it('is stable for the same input', async () => {
    expect(await merkle.root(leaves)).toBe(await merkle.root([...leaves]));
  });

  it('changes when a leaf changes', async () => {
    const other = [...leaves];
    other[2] = 'ff'.repeat(32);
    expect(await merkle.root(other)).not.toBe(await merkle.root(leaves));
  });

  it('produces a proof for every index that verifies against the root', async () => {
    const root = await merkle.root(leaves);
    for (let i = 0; i < leaves.length; i += 1) {
      const path = await merkle.proof(leaves, i);
      expect(await merkle.verifyProof(leaves[i] as string, path, root)).toBe(true);
    }
  });

  it('fails a proof when the leaf is swapped', async () => {
    const root = await merkle.root(leaves);
    const path = await merkle.proof(leaves, 1);
    expect(await merkle.verifyProof('ab'.repeat(32), path, root)).toBe(false);
  });

  it('handles the empty and single-leaf cases', async () => {
    expect(await merkle.root([])).toBe('0'.repeat(64));
    expect(await merkle.root([leaves[0] as string])).toBe(await merkle.leafHash(leaves[0] as string));
  });
});

describe('chain', () => {
  const body = {
    i: 0,
    at: '2026-11-13T01:00:00.000Z',
    tool: 'read',
    args: { path: 'a.txt' },
    result: { bytes: 3 },
    model: null,
    human: { approved: false },
    prev: GENESIS,
  };

  it('changes the hash when any field changes', async () => {
    const h1 = await stepHash(body, await commitments(body));
    const changed = { ...body, result: { bytes: 4 } };
    const h2 = await stepHash(changed, await commitments(changed));
    expect(h1).not.toBe(h2);
  });

  it('keeps the hash stable when only key order changes', async () => {
    const h1 = await stepHash(body, await commitments(body));
    const reordered = { ...body, args: { path: 'a.txt' } };
    expect(await stepHash(reordered, await commitments(reordered))).toBe(h1);
  });
});

describe('bundle', () => {
  const signerFor = (): ReturnType<typeof generateOperator> => generateOperator();

  it('seals a run and verifies it', async () => {
    const signer = await signerFor();
    const run = courierRun({ seed: 7 });
    const bundle = await sealRun(run.meta, run.drafts, signer);
    const verdict = await verifyBundle(bundle);
    expect(verdict.ok).toBe(true);
    expect(verdict.checks.map((c) => c.name)).toEqual(['shape', 'chain', 'root', 'signature']);
    expect(verdict.steps).toBe(run.drafts.length);
    expect(verdict.bytes).toBeLessThan(8192);
  });

  it('is reproducible: same drafts, different key, same root', async () => {
    const a = await sealRun(courierRun({ seed: 9 }).meta, courierRun({ seed: 9 }).drafts, await signerFor());
    const b = await sealRun(courierRun({ seed: 9 }).meta, courierRun({ seed: 9 }).drafts, await signerFor());
    expect(a.root).toBe(b.root);
    expect(a.run.operator.keyId).not.toBe(b.run.operator.keyId);
  });

  it('localises a field edit to the step and the field', async () => {
    const bundle = await sealRun(courierRun().meta, courierRun().drafts, await signerFor());
    const dirty = tamperWith(bundle, 4, 'result', (v) => ({ ...(v as object), edited: true }));
    const verdict = await verifyBundle(dirty);
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.some((f) => f.step === 4 && f.field === 'result')).toBe(true);
    expect(verdict.checks.find((c) => c.name === 'chain')?.ok).toBe(false);
  });

  it('catches a re-signed bundle under the wrong key', async () => {
    const bundle = await sealRun(courierRun().meta, courierRun().drafts, await signerFor());
    const forged = await forgeSignature(bundle, await signerFor());
    const verdict = await verifyBundle(forged);
    expect(verdict.ok).toBe(false);
    expect(verdict.checks.find((c) => c.name === 'signature')?.ok).toBe(false);
    expect(verdict.checks.find((c) => c.name === 'chain')?.ok).toBe(true);
  });

  it('reports a broken prev link', async () => {
    const bundle = await sealRun(courierRun().meta, courierRun().drafts, await signerFor());
    const broken = structuredClone(bundle) as Bundle;
    const target = broken.steps[3];
    if (target) target.prev = 'ff'.repeat(32);
    const verdict = await verifyBundle(broken);
    expect(verdict.ok).toBe(false);
    expect(verdict.failures.some((f) => f.field === 'prev')).toBe(true);
  });

  it('keeps a 12-step run under 8 KB and a step under 600 bytes on average', async () => {
    const bundle = await sealRun(courierRun().meta, courierRun().drafts, await signerFor());
    expect(byteLength(bundle)).toBeLessThan(8192);
    expect(byteLength(bundle) / bundle.steps.length).toBeLessThan(600);
  });

  it('serialises deterministically', async () => {
    const bundle = await sealRun(courierRun().meta, courierRun().drafts, await signerFor());
    expect(serialise(bundle)).toBe(serialise(structuredClone(bundle) as Bundle));
  });
});

describe('proof', () => {
  it('verifies a disclosed step on its own', async () => {
    const bundle = await sealRun(courierRun().meta, courierRun().drafts, await generateOperator());
    const proof = await makeProof(bundle, 4);
    const verdict = await verifyProof(proof);
    expect(verdict.ok).toBe(true);
    expect(proof.path.length).toBeGreaterThan(2);
  });

  it('fails when the disclosed step was edited', async () => {
    const bundle = await sealRun(courierRun().meta, courierRun().drafts, await generateOperator());
    const proof = await makeProof(bundle, 4);
    const edited = structuredClone(proof);
    edited.step.result = { ...edited.step.result, edited: true };
    const verdict = await verifyProof(edited);
    expect(verdict.ok).toBe(false);
    expect(verdict.checks.find((c) => c.name === 'step')?.ok).toBe(false);
  });

  it('fails when the root was swapped', async () => {
    const bundle = await sealRun(courierRun().meta, courierRun().drafts, await generateOperator());
    const proof = await makeProof(bundle, 4);
    const swapped = structuredClone(proof);
    swapped.root = 'ff'.repeat(32);
    expect((await verifyProof(swapped)).ok).toBe(false);
  });
});

describe('anchor', () => {
  it('recomputes the data root from the bundle', async () => {
    const bundle = await sealRun(courierRun().meta, courierRun().drafts, await generateOperator());
    const packet = await anchorPacket(bundle);
    expect(await checkAnchor(bundle, packet)).toBe(true);
    expect(packet.tags.find((t) => t.name === 'Tessera-Root')?.value).toBe(bundle.root);
  });

  it('does not depend on pretty-printing', async () => {
    const bundle = await sealRun(courierRun().meta, courierRun().drafts, await generateOperator());
    const packet = await anchorPacket(bundle);
    const reparsed = JSON.parse(JSON.stringify(bundle, null, 2)) as Bundle;
    expect(await checkAnchor(reparsed, packet)).toBe(true);
  });
});

describe('inspect', () => {
  it('says nothing moved on a clean step', async () => {
    const bundle = await sealRun(courierRun().meta, courierRun().drafts, await generateOperator());
    const step = bundle.steps[2];
    if (!step) throw new Error('missing step');
    const { hash, moved } = await inspect(step);
    expect(hash).toBe(step.h);
    expect(moved).toEqual([]);
  });
});
