/** Selective disclosure: one step, log2(n) hashes, and the operator key — nothing else. */

import { inspect } from './chain';
import * as merkle from './merkle';
import { verifyRoot } from './sign';
import type { Bundle, Proof } from './types';

export async function makeProof(bundle: Bundle, index: number): Promise<Proof> {
  const step = bundle.steps[index];
  if (!step) throw new Error(`prove: no step ${index}`);
  const path = await merkle.proof(bundle.steps.map((s) => s.h), index);
  return {
    v: 1,
    runId: bundle.run.id,
    root: bundle.root,
    i: index,
    step: structuredClone(step),
    path,
    operator: structuredClone(bundle.run.operator),
    sig: structuredClone(bundle.sig),
  };
}

export type ProofVerdict = {
  ok: boolean;
  checks: { name: 'step' | 'path' | 'signature'; ok: boolean; detail: string }[];
};

export async function verifyProof(proof: Proof): Promise<ProofVerdict> {
  const checks: ProofVerdict['checks'] = [];

  const { hash, moved } = await inspect(proof.step);
  const stepOk = hash === proof.step.h;
  checks.push({
    name: 'step',
    ok: stepOk,
    detail: stepOk ? `step ${proof.i} hash recomputed` : `step ${proof.i} changed${moved.length ? `: ${moved.join(', ')}` : ''}`,
  });

  const pathOk = await merkle.verifyProof(proof.step.h, proof.path, proof.root);
  checks.push({
    name: 'path',
    ok: pathOk,
    detail: pathOk ? `${proof.path.length} hashes lead to the sealed root` : 'proof does not reach the root',
  });

  const sigOk = await verifyRoot(proof.operator.publicKeyJwk, proof.runId, proof.root, proof.sig);
  checks.push({
    name: 'signature',
    ok: sigOk,
    detail: sigOk ? 'root is signed by the operator' : 'root is not signed by the operator',
  });

  return { ok: checks.every((c) => c.ok), checks };
}
