#!/usr/bin/env node
/**
 * Tessera CLI. Bundled to bin/tessera.mjs by `npm run build:cli`; that file is committed so a
 * stranger can run it from a fresh clone without a build step.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { courierRun } from './agent/agent';
import { anchorPacket, checkAnchor } from './lib/anchor';
import { byteLength, forgeSignature, sealRun, serialise, tamperWith, verifyBundle } from './lib/bundle';
import { makeProof, verifyProof } from './lib/proof';
import { generateOperator } from './lib/sign';
import type { Bundle, FieldName, Proof } from './lib/types';

const argv = process.argv.slice(2);
const cmd = argv[0] ?? 'help';

function flag(name: string, fallback?: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return argv[i + 1] ?? fallback;
}
const has = (name: string): boolean => argv.includes(`--${name}`);

function die(message: string): never {
  console.error(message);
  process.exit(2);
}

function readBundle(path: string): Bundle {
  try {
    return JSON.parse(readFileSync(resolve(path), 'utf8')) as Bundle;
  } catch {
    return die(`cannot read bundle: ${path}`);
  }
}

function writeBundle(path: string, bundle: Bundle): string {
  const full = resolve(path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, serialise(bundle), 'utf8');
  return full;
}

function writeJson(path: string, value: unknown): string {
  const full = resolve(path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return full;
}

async function cmdDemo(): Promise<void> {
  const seed = Number(flag('seed', '7'));
  const signer = await generateOperator();
  const run = courierRun({ seed });
  const bundle = await sealRun(run.meta, run.drafts, signer);
  const out = resolve(flag('out', 'proof/samples/clean.tessera') as string);
  writeBundle(out, bundle);
  console.log(`sealed  ${bundle.steps.length} steps · ${byteLength(bundle)} bytes · root ${bundle.root.slice(0, 16)}…`);
  console.log(`written ${out}`);
  if (has('twice')) {
    const again = await sealRun(run.meta, run.drafts, signer);
    console.log(again.root === bundle.root ? `reproducible  same root on a second seal (${again.root.slice(0, 16)}…)` : 'NOT reproducible: roots differ');
    if (again.root !== bundle.root) process.exit(1);
  }
  // The signing key is written beside the bundle so the sample set can be rebuilt, and so anyone
  // can show that re-signing with a different key is detectable.
  writeJson(`${out}.operator.json`, signer.publicKeyJwk);
}

async function cmdKey(): Promise<void> {
  const signer = await generateOperator();
  console.log(JSON.stringify({ keyId: signer.keyId, publicKeyJwk: signer.publicKeyJwk }, null, 2));
}

async function cmdVerify(): Promise<void> {
  const path = argv[1];
  if (!path) die('usage: tessera verify <bundle>');
  const bundle = readBundle(path);
  const verdict = await verifyBundle(bundle);
  console.log(`Tessera verify — ${path}`);
  console.log(`run       ${bundle.run?.id ?? '?'}  ${bundle.run?.agent?.name ?? '?'} ${bundle.run?.agent?.version ?? ''}`);
  console.log(`steps     ${verdict.steps}`);
  console.log(`bytes     ${verdict.bytes}`);
  for (const c of verdict.checks) {
    console.log(`${c.name.padEnd(9)} ${c.ok ? 'PASS' : 'FAIL'}  ${c.ms.toFixed(2)} ms  ${c.detail}`);
  }
  if (!verdict.ok) {
    console.log('---');
    for (const f of verdict.failures) {
      console.log(f.step < 0 ? `FAIL  ${f.field}: ${f.note}` : `step ${f.step} · ${f.field} · ${f.note}`);
    }
  }
  console.log('-'.repeat(66));
  console.log(`${verdict.ok ? 'PASS' : 'FAIL'}  ${verdict.steps} steps · ${verdict.bytes} bytes · ${verdict.ms} ms`);
  process.exit(verdict.ok ? 0 : 1);
}

async function cmdTamper(): Promise<void> {
  const path = argv[1];
  if (!path) die('usage: tessera tamper <bundle> --step 4 --field result --out x.tessera');
  const bundle = readBundle(path);
  const index = Number(flag('step', '4'));
  const field = (flag('field', 'result') ?? 'result') as FieldName;
  const patch = (value: unknown): unknown => {
    switch (field) {
      case 'tool':
        return `${String(value)} (edited)`;
      case 'args':
        return { ...(value as Record<string, unknown>), edited: true };
      case 'result':
        return { ...(value as Record<string, unknown>), edited: true };
      case 'model':
        return value === null ? { id: 'edited-model', declared: true } : { ...(value as Record<string, unknown>), id: 'edited-model' };
      case 'human':
        return { ...(value as Record<string, unknown>), approved: !(value as { approved?: boolean })?.approved };
      default:
        return value;
    }
  };
  const out = flag('out', `proof/samples/tampered.tessera`) as string;
  writeBundle(out, tamperWith(bundle, index, field, patch));
  console.log(`tampered step ${index} field ${field} → ${resolve(out)}`);
}

async function cmdForge(): Promise<void> {
  const path = argv[1];
  if (!path) die('usage: tessera forge <bundle> --out x.tessera');
  const bundle = readBundle(path);
  const other = await generateOperator();
  const out = flag('out', 'proof/samples/forged.tessera') as string;
  writeBundle(out, await forgeSignature(bundle, other));
  console.log(`re-signed with a different key (${other.keyId}) while claiming ${bundle.run.operator.keyId} → ${resolve(out)}`);
}

async function cmdProve(): Promise<void> {
  const path = argv[1];
  if (!path) die('usage: tessera prove <bundle> --step 4 --out proof.json');
  const bundle = readBundle(path);
  const index = Number(flag('step', '4'));
  const proof = await makeProof(bundle, index);
  const out = flag('out', 'proof/samples/proof.json') as string;
  writeJson(out, proof);
  console.log(`proof for step ${index}: ${proof.path.length} hashes · ${Buffer.byteLength(JSON.stringify(proof, null, 2))} bytes → ${resolve(out)}`);
}

async function cmdCheckProof(): Promise<void> {
  const path = argv[1];
  if (!path) die('usage: tessera check-proof <proof.json>');
  let proof: Proof;
  try {
    proof = JSON.parse(readFileSync(resolve(path), 'utf8')) as Proof;
  } catch {
    die(`cannot read proof: ${path}`);
  }
  const verdict = await verifyProof(proof);
  for (const c of verdict.checks) console.log(`${c.name.padEnd(9)} ${c.ok ? 'PASS' : 'FAIL'}  ${c.detail}`);
  console.log(verdict.ok ? 'PASS  this step belongs to the sealed run' : 'FAIL  this step does not belong to the sealed run');
  process.exit(verdict.ok ? 0 : 1);
}

async function cmdAnchor(): Promise<void> {
  const path = argv[1];
  if (!path) die('usage: tessera anchor <bundle> [--out packet.json]');
  const bundle = readBundle(path);
  const packet = await anchorPacket(bundle);
  console.log(JSON.stringify(packet, null, 2));
  const out = flag('out');
  if (out) console.log(`written ${writeJson(out, packet)}`);
  const ok = await checkAnchor(bundle, packet);
  console.log(ok ? 'PASS  dataRoot recomputed from the bundle' : 'FAIL  dataRoot does not match');
  process.exit(ok ? 0 : 1);
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function cmdSelfcheck(): Promise<void> {
  const rounds = Number(flag('rounds', '200'));
  const signer = await generateOperator();
  const run = courierRun({ seed: 11, scale: 3 });
  const clean = await sealRun(run.meta, run.drafts, signer);
  const rand = rng(20261113);
  const fields: FieldName[] = ['tool', 'args', 'result', 'model', 'human'];
  let hit = 0;
  let missed = 0;
  const started = Date.now();
  for (let r = 0; r < rounds; r += 1) {
    const index = Math.floor(rand() * clean.steps.length);
    const field = fields[Math.floor(rand() * fields.length)] as FieldName;
    const patch = (value: unknown): unknown => {
      if (field === 'human') return { ...(value as Record<string, unknown>), approved: !(value as { approved?: boolean })?.approved };
      if (field === 'model') return value === null ? { id: 'edited', declared: true } : { ...(value as Record<string, unknown>), id: 'edited' };
      if (field === 'tool') return `${String(value)}-${r}`;
      return { ...(value as Record<string, unknown>), r };
    };
    const dirty = tamperWith(clean, index, field, patch);
    const verdict = await verifyBundle(dirty);
    const named = verdict.failures.some((f) => f.step === index && f.field === field);
    if (!verdict.ok && named) hit += 1;
    else {
      missed += 1;
      console.log(`MISS round ${r}: step ${index} field ${field} → ${JSON.stringify(verdict.failures.slice(0, 2))}`);
    }
  }
  const rate = (hit / rounds) * 100;
  console.log(`selfcheck  ${rounds} single-field mutations · ${hit} located · ${missed} missed · ${rate.toFixed(1)}% · ${Date.now() - started} ms`);
  console.log(`clean bundle ${clean.steps.length} steps · ${byteLength(clean)} bytes`);
  process.exit(missed === 0 ? 0 : 1);
}

async function cmdBench(): Promise<void> {
  const scale = Number(flag('scale', '30'));
  const signer = await generateOperator();
  const run = courierRun({ seed: 3, scale });
  const t0 = performance.now();
  const bundle = await sealRun(run.meta, run.drafts, signer);
  const sealMs = performance.now() - t0;
  const times: number[] = [];
  let verdictOk = true;
  for (let i = 0; i < 5; i += 1) {
    const t = performance.now();
    const v = await verifyBundle(bundle);
    times.push(performance.now() - t);
    verdictOk &&= v.ok;
  }
  times.sort((a, b) => a - b);
  const median = times[2] ?? 0;
  const proofBytes = Buffer.byteLength(JSON.stringify(await makeProof(bundle, Math.floor(bundle.steps.length / 2))));
  console.log(`steps        ${bundle.steps.length}`);
  console.log(`bundle       ${byteLength(bundle)} bytes (${(byteLength(bundle) / bundle.steps.length).toFixed(0)} B/step)`);
  console.log(`seal         ${sealMs.toFixed(1)} ms`);
  console.log(`verify       ${median.toFixed(1)} ms median of 5 (${times.map((t) => t.toFixed(1)).join(', ')})`);
  console.log(`proof        ${proofBytes} bytes`);
  console.log(`verdict      ${verdictOk ? 'PASS' : 'FAIL'}`);
  process.exit(verdictOk ? 0 : 1);
}

const commands: Record<string, () => Promise<void>> = {
  demo: cmdDemo,
  key: cmdKey,
  verify: cmdVerify,
  tamper: cmdTamper,
  forge: cmdForge,
  prove: cmdProve,
  'check-proof': cmdCheckProof,
  anchor: cmdAnchor,
  selfcheck: cmdSelfcheck,
  bench: cmdBench,
};

const run = commands[cmd];
if (!run) {
  console.log(`Tessera — receipts for agent runs

  tessera demo [--seed 7] [--out file] [--twice]   run the demo agent and seal it
  tessera verify <bundle>                          recompute shape, chain, root, signature
  tessera tamper <bundle> --step N --field F --out file
  tessera forge <bundle> --out file                re-sign with a different key
  tessera prove <bundle> --step N --out file       selective disclosure proof
  tessera check-proof <proof>                      verify a proof on its own
  tessera anchor <bundle> [--out file]             Arweave anchor packet + dataRoot check
  tessera selfcheck [--rounds 200]                 single-field mutations, localisation rate
  tessera bench [--scale 30]                       size and timing numbers
`);
  process.exit(cmd === 'help' ? 0 : 2);
}
await run();
