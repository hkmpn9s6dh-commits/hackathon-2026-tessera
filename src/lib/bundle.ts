/** Seal a run into a bundle, and verify one. No network, no globals other than WebCrypto. */

import { canonical } from './canonical';
import { commitments, inspect, stepHash } from './chain';
import { GENESIS, sha256Hex } from './hash';
import * as merkle from './merkle';
import { message, signRoot, verifyRoot, type Signer } from './sign';
import type { Bundle, Check, Failure, FieldName, Step, StepBody, StepDraft, Verdict } from './types';

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function serialise(bundle: Bundle): string {
  // Compact on purpose: the file is a receipt, not a document. The page prettifies it.
  return JSON.stringify(bundle);
}

export function byteLength(bundle: Bundle): number {
  return new TextEncoder().encode(serialise(bundle)).length;
}

export async function sealRun(
  meta: { id: string; startedAt: string; agent: { name: string; version: string } },
  bodies: readonly (StepBody | StepDraft)[],
  signer: Signer,
): Promise<Bundle> {
  const steps: Step[] = [];
  let prev = GENESIS;
  for (const [i, raw] of bodies.entries()) {
    const body: StepBody = { ...raw, i, prev };
    const fc = await commitments(body);
    const h = await stepHash(body, fc);
    steps.push({ ...body, fc, h });
    prev = h;
  }
  const root = await merkle.root(steps.map((s) => s.h));
  const sig = await signRoot(signer.privateKey, meta.id, root, signer.keyId);
  return {
    v: 1,
    run: {
      id: meta.id,
      startedAt: meta.startedAt,
      agent: meta.agent,
      operator: { keyId: signer.keyId, publicKeyJwk: signer.publicKeyJwk },
    },
    steps,
    root,
    sig,
  };
}

const HEX64 = /^[0-9a-f]{64}$/;
const HEX12 = /^[0-9a-f]{12}$/;

function shapeIssues(bundle: Bundle): string[] {
  const issues: string[] = [];
  if (bundle?.v !== 1) issues.push('version is not 1');
  if (!bundle?.run?.id) issues.push('run id missing');
  if (!bundle?.run?.operator?.publicKeyJwk) issues.push('operator key missing');
  if (!Array.isArray(bundle?.steps) || bundle.steps.length === 0) issues.push('no steps');
  if (!HEX64.test(bundle?.root ?? '')) issues.push('root is not 32 bytes of hex');
  if (!bundle?.sig?.value) issues.push('signature missing');
  (bundle?.steps ?? []).forEach((s, i) => {
    if (s.i !== i) issues.push(`step ${i} has index ${s.i}`);
    if (!HEX64.test(s.h ?? '')) issues.push(`step ${i} hash is not 32 bytes`);
    if (!HEX64.test(s.prev ?? '')) issues.push(`step ${i} prev is not 32 bytes`);
    if (i === 0 && s.prev !== GENESIS) issues.push('step 0 does not start at genesis');
    if (i > 0 && s.prev !== bundle.steps[i - 1]?.h) issues.push(`step ${i} prev does not link`);
    for (const [f, v] of Object.entries(s.fc ?? {})) {
      if (!HEX12.test(String(v))) issues.push(`step ${i} commitment ${f} is not 12 hex`);
    }
  });
  return issues;
}

export async function verifyBundle(bundle: Bundle): Promise<Verdict> {
  const started = now();
  const checks: Check[] = [];
  const failures: Failure[] = [];
  const steps = Array.isArray(bundle?.steps) ? bundle.steps : [];
  const bytes = byteLength(bundle);

  // 1. shape
  let t = now();
  const shape = shapeIssues(bundle);
  checks.push({
    name: 'shape',
    ok: shape.length === 0,
    ms: now() - t,
    detail: shape.length === 0 ? `${steps.length} steps, indices and links in order` : shape.slice(0, 3).join('; '),
  });
  for (const issue of shape.slice(0, 3)) failures.push({ step: -1, field: 'hash', note: issue });

  // 2. chain
  t = now();
  const chainBefore = failures.length;
  let movedField: { step: number; fields: FieldName[] } | null = null;
  const stepHashes: string[] = [];
  for (const [i, step] of steps.entries()) {
    const { hash, moved } = await inspect(step);
    stepHashes.push(step.h);
    if (hash !== step.h) {
      failures.push({ step: i, field: moved[0] ?? 'hash', note: moved.length ? `field moved: ${moved.join(', ')}` : 'hash does not match contents' });
      if (!movedField) movedField = { step: i, fields: moved };
    }
    if (i > 0 && step.prev !== steps[i - 1]?.h) {
      failures.push({ step: i, field: 'prev', note: 'prev does not link to the previous hash' });
    }
  }
  const chainOk = failures.length === chainBefore;
  checks.push({
    name: 'chain',
    ok: chainOk,
    ms: now() - t,
    detail: chainOk
      ? `${steps.length} step hashes recomputed`
      : movedField
        ? `step ${movedField.step}: ${movedField.fields.join(', ') || 'hash'} changed`
        : 'chain broken',
  });

  // 3. root
  t = now();
  const rootRecomputed = await merkle.root(stepHashes);
  const rootOk = rootRecomputed === bundle?.root;
  if (!rootOk) failures.push({ step: -1, field: 'root', note: `root ${bundle?.root?.slice(0, 12)}… ≠ recomputed ${rootRecomputed.slice(0, 12)}…` });
  checks.push({
    name: 'root',
    ok: rootOk,
    ms: now() - t,
    detail: rootOk ? `merkle root over ${steps.length} leaves matches` : 'merkle root does not match',
  });

  // 4. signature
  t = now();
  const sigOk = await verifyRoot(bundle?.run?.operator?.publicKeyJwk, bundle?.run?.id, bundle?.root, bundle?.sig);
  if (!sigOk) failures.push({ step: -1, field: 'sig', note: 'signature does not verify against the operator key' });
  checks.push({
    name: 'signature',
    ok: sigOk,
    ms: now() - t,
    detail: sigOk ? `ECDSA P-256 over ${message(bundle?.run?.id, bundle?.root).slice(0, 18)}…` : 'signature does not verify',
  });

  return {
    ok: checks.every((c) => c.ok) && failures.length === 0,
    checks,
    failures,
    steps: steps.length,
    bytes,
    ms: Math.round((now() - started) * 100) / 100,
    root: bundle?.root ?? '',
    rootRecomputed,
  };
}

/** Flip a field in place and leave the seal alone: what a bundle looks like after an edit. */
export function tamperWith(bundle: Bundle, index: number, field: FieldName, patch: (value: unknown) => unknown): Bundle {
  const copy = structuredClone(bundle) as Bundle;
  const step = copy.steps[index];
  if (!step) throw new Error(`tamper: no step ${index}`);
  const key = field as keyof Step;
  (step as unknown as Record<string, unknown>)[key] = patch((step as unknown as Record<string, unknown>)[key]);
  return copy;
}

/** Re-seal a bundle with a different key while still claiming the original operator. */
export async function forgeSignature(bundle: Bundle, signer: Signer): Promise<Bundle> {
  const copy = structuredClone(bundle) as Bundle;
  copy.sig = await signRoot(signer.privateKey, copy.run.id, copy.root, signer.keyId);
  return copy;
}

/** Deterministic run id from the first step hash, so a replayed run gets the same identity. */
export async function deriveRunId(seed: string): Promise<string> {
  return (await sha256Hex(canonical({ seed }))).slice(0, 16);
}
