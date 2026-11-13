#!/usr/bin/env node

// src/cli.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// src/agent/agent.ts
var PHONE = /\b\d{3}-\d{4}-\d{4}\b/g;
var INVOICES = [
  { id: "0412", vendor: "Northwind Cables", amount: 128400, phone: "021-5566-7788", note: "Brake housing, 40 m" },
  { id: "0417", vendor: "Kestrel Bearings", amount: 86250, phone: "0755-2233-4455", note: "Sealed bearings, 24 pcs" },
  { id: "0421", vendor: "Loom & Spoke", amount: 21900, phone: "010-8899-1122", note: "Spoke blanks, 200 pcs" }
];
var money = (cents) => `${(cents / 100).toFixed(2)} CNY`;
function stamp(seed, index) {
  const base = Date.UTC(2026, 10, 13, 1, 0, 0) + seed * 1e3;
  return new Date(base + index * 1e3).toISOString();
}
function courierRun(options = {}) {
  const seed = options.seed ?? 7;
  const scale = Math.max(1, Math.floor(options.scale ?? 1));
  const drafts = [];
  let n = 0;
  const at = () => stamp(seed, n);
  const push = (draft) => {
    drafts.push({ ...draft, at: at() });
    n += 1;
  };
  const files = Array.from({ length: 3 * scale }, (_, i) => {
    const base = INVOICES[i % INVOICES.length];
    const round = Math.floor(i / INVOICES.length);
    return { ...base, id: `${base.id}${round === 0 ? "" : `-${round + 1}`}`, path: `inbox/invoice-${base.id}${round === 0 ? "" : `-${round + 1}`}.txt` };
  });
  push({
    tool: "list",
    args: { path: "inbox" },
    result: { entries: files.map((f) => f.path), count: files.length },
    model: null,
    human: { approved: false }
  });
  push({
    tool: "read",
    args: { path: "inbox/manifest.json" },
    result: { bytes: 214, records: files.length, policy: "redact phone numbers before summarizing" },
    model: null,
    human: { approved: false }
  });
  const parsed = [];
  for (const file of files) {
    const phone = file.phone;
    const before = `${file.vendor} \u2014 ${money(file.amount)} \u2014 contact ${phone}`;
    push({
      tool: "read",
      args: { path: file.path },
      result: { bytes: before.length, lines: 3 },
      model: null,
      human: { approved: false }
    });
    const after = before.replace(PHONE, "[[phone]]");
    push({
      tool: "redact",
      args: { path: file.path, rule: "phone" },
      result: { removed: phone.match(PHONE)?.length ?? 0, preview: after },
      model: null,
      human: { approved: false }
    });
    parsed.push({ id: file.id, vendor: file.vendor, amount: file.amount });
  }
  const total = parsed.reduce((sum, p) => sum + p.amount, 0);
  const model = { id: "local-policy-v1", provider: "tessera-demo", declared: true };
  push({
    tool: "summarise",
    args: { inputs: parsed.map((p) => p.id), style: "four bullets" },
    result: {
      bullets: parsed.map((p) => `${p.vendor}: ${money(p.amount)}`),
      total: money(total)
    },
    model,
    human: { approved: false }
  });
  push({
    tool: "tally",
    args: { currency: "CNY" },
    result: { count: parsed.length, total_cents: total, total: money(total) },
    model: null,
    human: { approved: false }
  });
  const digest = [
    `# Invoice digest \u2014 ${parsed.length} records`,
    "",
    ...parsed.map((p) => `- ${p.vendor} \xB7 ${p.id} \xB7 ${money(p.amount)}`),
    "",
    `Total: ${money(total)}`,
    "",
    "Phone numbers were redacted before the digest was written."
  ].join("\n");
  push({
    tool: "write",
    args: { path: "out/digest.md", bytes: digest.length },
    result: { written: true, preview: digest.split("\n")[0] ?? "" },
    model: null,
    human: { approved: false }
  });
  push({
    tool: "notify",
    args: { channel: "email", to: "ops@example.invalid", subject: "Invoice digest ready" },
    result: { queued: true, requires_approval: true },
    model: null,
    human: { approved: true, by: "operator" }
  });
  return {
    meta: {
      id: `run-${seed}-${parsed.length}`,
      startedAt: stamp(seed, 0),
      agent: { name: "courier", version: "1.0.0" }
    },
    drafts,
    digest
  };
}

// src/lib/hash.ts
var enc = new TextEncoder();
function toHex(bytes2) {
  let out = "";
  for (const b of bytes2) out += b.toString(16).padStart(2, "0");
  return out;
}
function fromHex(hex) {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error("fromHex: not hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytes(value) {
  return typeof value === "string" ? enc.encode(value) : value;
}
var asSource = (u) => u;
async function sha256(input) {
  const digest = await crypto.subtle.digest("SHA-256", asSource(bytes(input)));
  return new Uint8Array(digest);
}
async function sha256Hex(input) {
  return toHex(await sha256(input));
}
function b64url(bytesIn) {
  let s = "";
  for (const b of bytesIn) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s) {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
var GENESIS = "0".repeat(64);

// src/lib/canonical.ts
function canonical(value) {
  return write(value, /* @__PURE__ */ new Set());
}
function write(value, seen) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "string") return JSON.stringify(value);
  if (t === "number") {
    const n = value;
    if (!Number.isFinite(n)) throw new Error("canonical: non-finite number");
    return JSON.stringify(n);
  }
  if (t !== "object") throw new Error(`canonical: unsupported type ${t}`);
  const obj = value;
  if (seen.has(obj)) throw new Error("canonical: cycle");
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      const parts2 = [];
      for (const item of obj) {
        if (item === void 0) throw new Error("canonical: undefined in array");
        parts2.push(write(item, seen));
      }
      return `[${parts2.join(",")}]`;
    }
    const rec = obj;
    const keys = Object.keys(rec).sort();
    const parts = [];
    for (const k of keys) {
      const v = rec[k];
      if (v === void 0) throw new Error(`canonical: undefined at ${k}`);
      parts.push(`${JSON.stringify(k)}:${write(v, seen)}`);
    }
    return `{${parts.join(",")}}`;
  } finally {
    seen.delete(obj);
  }
}

// src/lib/anchor.ts
async function anchorPacket(bundle) {
  const raw = new TextEncoder().encode(canonical(bundle));
  const dataRoot = b64url(await sha256(raw));
  return {
    protocol: "arweave",
    dataRoot,
    bytes: raw.length,
    contentType: "application/json",
    tags: [
      { name: "App-Name", value: "Tessera" },
      { name: "App-Version", value: "1" },
      { name: "Tessera-Run", value: bundle.run.id },
      { name: "Tessera-Root", value: bundle.root },
      { name: "Tessera-Steps", value: String(bundle.steps.length) },
      { name: "Tessera-Key", value: bundle.run.operator.keyId },
      { name: "Content-Type", value: "application/json" }
    ],
    endpoint: "https://arweave.net/tx",
    note: "Posting this payload costs AR and needs a wallet. Tessera v1 stops at the packet: anyone can re-hash the bundle and compare with dataRoot."
  };
}
async function checkAnchor(bundle, packet) {
  const raw = new TextEncoder().encode(canonical(bundle));
  return b64url(await sha256(raw)) === packet.dataRoot;
}

// src/lib/types.ts
var FIELDS = ["tool", "args", "result", "model", "human"];

// src/lib/chain.ts
async function commitments(body) {
  const out = {};
  for (const f of FIELDS) {
    out[f] = (await sha256Hex(canonical(body[f]))).slice(0, 12);
  }
  return out;
}
async function stepHash(body, fc) {
  return sha256Hex(canonical({ ...body, fc }));
}
async function inspect(step) {
  const body = {
    i: step.i,
    at: step.at,
    tool: step.tool,
    args: step.args,
    result: step.result,
    model: step.model,
    human: step.human,
    prev: step.prev
  };
  const hash = await stepHash(body, step.fc);
  const recomputed = await commitments(body);
  const moved = FIELDS.filter((f) => recomputed[f] !== step.fc[f]);
  return { hash, moved };
}

// src/lib/merkle.ts
var LEAF = 0;
var NODE = 1;
function concat(prefix, ...parts) {
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
async function leafHash(stepHashHex) {
  const h = await sha256(concat(LEAF, fromHex(stepHashHex)));
  return toHex(h);
}
async function nodeHash(leftHex, rightHex) {
  const h = await sha256(concat(NODE, fromHex(leftHex), fromHex(rightHex)));
  return toHex(h);
}
async function levels(stepHashes) {
  const out = [];
  let level = await Promise.all(stepHashes.map(leafHash));
  out.push(level);
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];
      if (left === void 0) break;
      if (right === void 0) next.push(left);
      else next.push(await nodeHash(left, right));
    }
    out.push(next);
    level = next;
  }
  return out;
}
async function root(stepHashes) {
  if (stepHashes.length === 0) return "0".repeat(64);
  const lv = await levels(stepHashes);
  const top = lv[lv.length - 1];
  return top?.[0] ?? "0".repeat(64);
}
async function proof(stepHashes, index) {
  if (index < 0 || index >= stepHashes.length) throw new Error("proof: index out of range");
  const lv = await levels(stepHashes);
  const path = [];
  let at = index;
  for (let d = 0; d < lv.length - 1; d += 1) {
    const level = lv[d];
    if (level === void 0) break;
    const sibling = at ^ 1;
    const sib = level[sibling];
    if (sib !== void 0) {
      path.push({ side: (at & 1) === 0 ? "R" : "L", h: sib });
    }
    at >>= 1;
  }
  return path;
}
async function verifyProof(stepHashHex, path, expectedRoot) {
  let cur = await leafHash(stepHashHex);
  for (const node of path) {
    cur = node.side === "L" ? await nodeHash(node.h, cur) : await nodeHash(cur, node.h);
  }
  return cur === expectedRoot;
}

// src/lib/sign.ts
var ALG = { name: "ECDSA", namedCurve: "P-256" };
var SIGN = { name: "ECDSA", hash: "SHA-256" };
async function generateOperator() {
  const pair = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const keyId = (await sha256Hex(canonical(publicKeyJwk))).slice(0, 16);
  return { keyId, publicKeyJwk, privateKey: pair.privateKey };
}
function message(runId, root2) {
  return `tessera/v1|${runId}|${root2}`;
}
async function signRoot(privateKey, runId, root2, keyId) {
  const raw = new Uint8Array(
    await crypto.subtle.sign(SIGN, privateKey, asSource(new TextEncoder().encode(message(runId, root2))))
  );
  return { alg: "ECDSA-P256-SHA256", keyId, value: b64url(raw) };
}
async function verifyRoot(publicKeyJwk, runId, root2, sig) {
  try {
    const key = await crypto.subtle.importKey("jwk", publicKeyJwk, ALG, false, ["verify"]);
    return await crypto.subtle.verify(SIGN, key, asSource(fromB64url(sig.value)), asSource(new TextEncoder().encode(message(runId, root2))));
  } catch {
    return false;
  }
}

// src/lib/bundle.ts
var now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
function serialise(bundle) {
  return JSON.stringify(bundle);
}
function byteLength(bundle) {
  return new TextEncoder().encode(serialise(bundle)).length;
}
async function sealRun(meta, bodies, signer) {
  const steps = [];
  let prev = GENESIS;
  for (const [i, raw] of bodies.entries()) {
    const body = { ...raw, i, prev };
    const fc = await commitments(body);
    const h = await stepHash(body, fc);
    steps.push({ ...body, fc, h });
    prev = h;
  }
  const root2 = await root(steps.map((s) => s.h));
  const sig = await signRoot(signer.privateKey, meta.id, root2, signer.keyId);
  return {
    v: 1,
    run: {
      id: meta.id,
      startedAt: meta.startedAt,
      agent: meta.agent,
      operator: { keyId: signer.keyId, publicKeyJwk: signer.publicKeyJwk }
    },
    steps,
    root: root2,
    sig
  };
}
var HEX64 = /^[0-9a-f]{64}$/;
var HEX12 = /^[0-9a-f]{12}$/;
function shapeIssues(bundle) {
  const issues = [];
  if (bundle?.v !== 1) issues.push("version is not 1");
  if (!bundle?.run?.id) issues.push("run id missing");
  if (!bundle?.run?.operator?.publicKeyJwk) issues.push("operator key missing");
  if (!Array.isArray(bundle?.steps) || bundle.steps.length === 0) issues.push("no steps");
  if (!HEX64.test(bundle?.root ?? "")) issues.push("root is not 32 bytes of hex");
  if (!bundle?.sig?.value) issues.push("signature missing");
  (bundle?.steps ?? []).forEach((s, i) => {
    if (s.i !== i) issues.push(`step ${i} has index ${s.i}`);
    if (!HEX64.test(s.h ?? "")) issues.push(`step ${i} hash is not 32 bytes`);
    if (!HEX64.test(s.prev ?? "")) issues.push(`step ${i} prev is not 32 bytes`);
    if (i === 0 && s.prev !== GENESIS) issues.push("step 0 does not start at genesis");
    if (i > 0 && s.prev !== bundle.steps[i - 1]?.h) issues.push(`step ${i} prev does not link`);
    for (const [f, v] of Object.entries(s.fc ?? {})) {
      if (!HEX12.test(String(v))) issues.push(`step ${i} commitment ${f} is not 12 hex`);
    }
  });
  return issues;
}
async function verifyBundle(bundle) {
  const started = now();
  const checks = [];
  const failures = [];
  const steps = Array.isArray(bundle?.steps) ? bundle.steps : [];
  const bytes2 = byteLength(bundle);
  let t = now();
  const shape = shapeIssues(bundle);
  checks.push({
    name: "shape",
    ok: shape.length === 0,
    ms: now() - t,
    detail: shape.length === 0 ? `${steps.length} steps, indices and links in order` : shape.slice(0, 3).join("; ")
  });
  for (const issue of shape.slice(0, 3)) failures.push({ step: -1, field: "hash", note: issue });
  t = now();
  const chainBefore = failures.length;
  let movedField = null;
  const stepHashes = [];
  for (const [i, step] of steps.entries()) {
    const { hash, moved } = await inspect(step);
    stepHashes.push(step.h);
    if (hash !== step.h) {
      failures.push({ step: i, field: moved[0] ?? "hash", note: moved.length ? `field moved: ${moved.join(", ")}` : "hash does not match contents" });
      if (!movedField) movedField = { step: i, fields: moved };
    }
    if (i > 0 && step.prev !== steps[i - 1]?.h) {
      failures.push({ step: i, field: "prev", note: "prev does not link to the previous hash" });
    }
  }
  const chainOk = failures.length === chainBefore;
  checks.push({
    name: "chain",
    ok: chainOk,
    ms: now() - t,
    detail: chainOk ? `${steps.length} step hashes recomputed` : movedField ? `step ${movedField.step}: ${movedField.fields.join(", ") || "hash"} changed` : "chain broken"
  });
  t = now();
  const rootRecomputed = await root(stepHashes);
  const rootOk = rootRecomputed === bundle?.root;
  if (!rootOk) failures.push({ step: -1, field: "root", note: `root ${bundle?.root?.slice(0, 12)}\u2026 \u2260 recomputed ${rootRecomputed.slice(0, 12)}\u2026` });
  checks.push({
    name: "root",
    ok: rootOk,
    ms: now() - t,
    detail: rootOk ? `merkle root over ${steps.length} leaves matches` : "merkle root does not match"
  });
  t = now();
  const sigOk = await verifyRoot(bundle?.run?.operator?.publicKeyJwk, bundle?.run?.id, bundle?.root, bundle?.sig);
  if (!sigOk) failures.push({ step: -1, field: "sig", note: "signature does not verify against the operator key" });
  checks.push({
    name: "signature",
    ok: sigOk,
    ms: now() - t,
    detail: sigOk ? `ECDSA P-256 over ${message(bundle?.run?.id, bundle?.root).slice(0, 18)}\u2026` : "signature does not verify"
  });
  return {
    ok: checks.every((c) => c.ok) && failures.length === 0,
    checks,
    failures,
    steps: steps.length,
    bytes: bytes2,
    ms: Math.round((now() - started) * 100) / 100,
    root: bundle?.root ?? "",
    rootRecomputed
  };
}
function tamperWith(bundle, index, field, patch) {
  const copy = structuredClone(bundle);
  const step = copy.steps[index];
  if (!step) throw new Error(`tamper: no step ${index}`);
  const key = field;
  step[key] = patch(step[key]);
  return copy;
}
async function forgeSignature(bundle, signer) {
  const copy = structuredClone(bundle);
  copy.sig = await signRoot(signer.privateKey, copy.run.id, copy.root, signer.keyId);
  return copy;
}

// src/lib/proof.ts
async function makeProof(bundle, index) {
  const step = bundle.steps[index];
  if (!step) throw new Error(`prove: no step ${index}`);
  const path = await proof(bundle.steps.map((s) => s.h), index);
  return {
    v: 1,
    runId: bundle.run.id,
    root: bundle.root,
    i: index,
    step: structuredClone(step),
    path,
    operator: structuredClone(bundle.run.operator),
    sig: structuredClone(bundle.sig)
  };
}
async function verifyProof2(proof2) {
  const checks = [];
  const { hash, moved } = await inspect(proof2.step);
  const stepOk = hash === proof2.step.h;
  checks.push({
    name: "step",
    ok: stepOk,
    detail: stepOk ? `step ${proof2.i} hash recomputed` : `step ${proof2.i} changed${moved.length ? `: ${moved.join(", ")}` : ""}`
  });
  const pathOk = await verifyProof(proof2.step.h, proof2.path, proof2.root);
  checks.push({
    name: "path",
    ok: pathOk,
    detail: pathOk ? `${proof2.path.length} hashes lead to the sealed root` : "proof does not reach the root"
  });
  const sigOk = await verifyRoot(proof2.operator.publicKeyJwk, proof2.runId, proof2.root, proof2.sig);
  checks.push({
    name: "signature",
    ok: sigOk,
    detail: sigOk ? "root is signed by the operator" : "root is not signed by the operator"
  });
  return { ok: checks.every((c) => c.ok), checks };
}

// src/cli.ts
var argv = process.argv.slice(2);
var cmd = argv[0] ?? "help";
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return argv[i + 1] ?? fallback;
}
var has = (name) => argv.includes(`--${name}`);
function die(message2) {
  console.error(message2);
  process.exit(2);
}
function readBundle(path) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch {
    return die(`cannot read bundle: ${path}`);
  }
}
function writeBundle(path, bundle) {
  const full = resolve(path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, serialise(bundle), "utf8");
  return full;
}
function writeJson(path, value) {
  const full = resolve(path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(value, null, 2)}
`, "utf8");
  return full;
}
async function cmdDemo() {
  const seed = Number(flag("seed", "7"));
  const signer = await generateOperator();
  const run2 = courierRun({ seed });
  const bundle = await sealRun(run2.meta, run2.drafts, signer);
  const out = resolve(flag("out", "proof/samples/clean.tessera"));
  writeBundle(out, bundle);
  console.log(`sealed  ${bundle.steps.length} steps \xB7 ${byteLength(bundle)} bytes \xB7 root ${bundle.root.slice(0, 16)}\u2026`);
  console.log(`written ${out}`);
  if (has("twice")) {
    const again = await sealRun(run2.meta, run2.drafts, signer);
    console.log(again.root === bundle.root ? `reproducible  same root on a second seal (${again.root.slice(0, 16)}\u2026)` : "NOT reproducible: roots differ");
    if (again.root !== bundle.root) process.exit(1);
  }
  writeJson(`${out}.operator.json`, signer.publicKeyJwk);
}
async function cmdKey() {
  const signer = await generateOperator();
  console.log(JSON.stringify({ keyId: signer.keyId, publicKeyJwk: signer.publicKeyJwk }, null, 2));
}
async function cmdVerify() {
  const path = argv[1];
  if (!path) die("usage: tessera verify <bundle>");
  const bundle = readBundle(path);
  const verdict = await verifyBundle(bundle);
  console.log(`Tessera verify \u2014 ${path}`);
  console.log(`run       ${bundle.run?.id ?? "?"}  ${bundle.run?.agent?.name ?? "?"} ${bundle.run?.agent?.version ?? ""}`);
  console.log(`steps     ${verdict.steps}`);
  console.log(`bytes     ${verdict.bytes}`);
  for (const c of verdict.checks) {
    console.log(`${c.name.padEnd(9)} ${c.ok ? "PASS" : "FAIL"}  ${c.ms.toFixed(2)} ms  ${c.detail}`);
  }
  if (!verdict.ok) {
    console.log("---");
    for (const f of verdict.failures) {
      console.log(f.step < 0 ? `FAIL  ${f.field}: ${f.note}` : `step ${f.step} \xB7 ${f.field} \xB7 ${f.note}`);
    }
  }
  console.log("-".repeat(66));
  console.log(`${verdict.ok ? "PASS" : "FAIL"}  ${verdict.steps} steps \xB7 ${verdict.bytes} bytes \xB7 ${verdict.ms} ms`);
  process.exit(verdict.ok ? 0 : 1);
}
async function cmdTamper() {
  const path = argv[1];
  if (!path) die("usage: tessera tamper <bundle> --step 4 --field result --out x.tessera");
  const bundle = readBundle(path);
  const index = Number(flag("step", "4"));
  const field = flag("field", "result") ?? "result";
  const patch = (value) => {
    switch (field) {
      case "tool":
        return `${String(value)} (edited)`;
      case "args":
        return { ...value, edited: true };
      case "result":
        return { ...value, edited: true };
      case "model":
        return value === null ? { id: "edited-model", declared: true } : { ...value, id: "edited-model" };
      case "human":
        return { ...value, approved: !value?.approved };
      default:
        return value;
    }
  };
  const out = flag("out", `proof/samples/tampered.tessera`);
  writeBundle(out, tamperWith(bundle, index, field, patch));
  console.log(`tampered step ${index} field ${field} \u2192 ${resolve(out)}`);
}
async function cmdForge() {
  const path = argv[1];
  if (!path) die("usage: tessera forge <bundle> --out x.tessera");
  const bundle = readBundle(path);
  const other = await generateOperator();
  const out = flag("out", "proof/samples/forged.tessera");
  writeBundle(out, await forgeSignature(bundle, other));
  console.log(`re-signed with a different key (${other.keyId}) while claiming ${bundle.run.operator.keyId} \u2192 ${resolve(out)}`);
}
async function cmdProve() {
  const path = argv[1];
  if (!path) die("usage: tessera prove <bundle> --step 4 --out proof.json");
  const bundle = readBundle(path);
  const index = Number(flag("step", "4"));
  const proof2 = await makeProof(bundle, index);
  const out = flag("out", "proof/samples/proof.json");
  writeJson(out, proof2);
  console.log(`proof for step ${index}: ${proof2.path.length} hashes \xB7 ${Buffer.byteLength(JSON.stringify(proof2, null, 2))} bytes \u2192 ${resolve(out)}`);
}
async function cmdCheckProof() {
  const path = argv[1];
  if (!path) die("usage: tessera check-proof <proof.json>");
  let proof2;
  try {
    proof2 = JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch {
    die(`cannot read proof: ${path}`);
  }
  const verdict = await verifyProof2(proof2);
  for (const c of verdict.checks) console.log(`${c.name.padEnd(9)} ${c.ok ? "PASS" : "FAIL"}  ${c.detail}`);
  console.log(verdict.ok ? "PASS  this step belongs to the sealed run" : "FAIL  this step does not belong to the sealed run");
  process.exit(verdict.ok ? 0 : 1);
}
async function cmdAnchor() {
  const path = argv[1];
  if (!path) die("usage: tessera anchor <bundle> [--out packet.json]");
  const bundle = readBundle(path);
  const packet = await anchorPacket(bundle);
  console.log(JSON.stringify(packet, null, 2));
  const out = flag("out");
  if (out) console.log(`written ${writeJson(out, packet)}`);
  const ok = await checkAnchor(bundle, packet);
  console.log(ok ? "PASS  dataRoot recomputed from the bundle" : "FAIL  dataRoot does not match");
  process.exit(ok ? 0 : 1);
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
async function cmdSelfcheck() {
  const rounds = Number(flag("rounds", "200"));
  const signer = await generateOperator();
  const run2 = courierRun({ seed: 11, scale: 3 });
  const clean = await sealRun(run2.meta, run2.drafts, signer);
  const rand = rng(20261113);
  const fields = ["tool", "args", "result", "model", "human"];
  let hit = 0;
  let missed = 0;
  const started = Date.now();
  for (let r = 0; r < rounds; r += 1) {
    const index = Math.floor(rand() * clean.steps.length);
    const field = fields[Math.floor(rand() * fields.length)];
    const patch = (value) => {
      if (field === "human") return { ...value, approved: !value?.approved };
      if (field === "model") return value === null ? { id: "edited", declared: true } : { ...value, id: "edited" };
      if (field === "tool") return `${String(value)}-${r}`;
      return { ...value, r };
    };
    const dirty = tamperWith(clean, index, field, patch);
    const verdict = await verifyBundle(dirty);
    const named = verdict.failures.some((f) => f.step === index && f.field === field);
    if (!verdict.ok && named) hit += 1;
    else {
      missed += 1;
      console.log(`MISS round ${r}: step ${index} field ${field} \u2192 ${JSON.stringify(verdict.failures.slice(0, 2))}`);
    }
  }
  const rate = hit / rounds * 100;
  console.log(`selfcheck  ${rounds} single-field mutations \xB7 ${hit} located \xB7 ${missed} missed \xB7 ${rate.toFixed(1)}% \xB7 ${Date.now() - started} ms`);
  console.log(`clean bundle ${clean.steps.length} steps \xB7 ${byteLength(clean)} bytes`);
  process.exit(missed === 0 ? 0 : 1);
}
async function cmdBench() {
  const scale = Number(flag("scale", "30"));
  const signer = await generateOperator();
  const run2 = courierRun({ seed: 3, scale });
  const t0 = performance.now();
  const bundle = await sealRun(run2.meta, run2.drafts, signer);
  const sealMs = performance.now() - t0;
  const times = [];
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
  console.log(`verify       ${median.toFixed(1)} ms median of 5 (${times.map((t) => t.toFixed(1)).join(", ")})`);
  console.log(`proof        ${proofBytes} bytes`);
  console.log(`verdict      ${verdictOk ? "PASS" : "FAIL"}`);
  process.exit(verdictOk ? 0 : 1);
}
var commands = {
  demo: cmdDemo,
  key: cmdKey,
  verify: cmdVerify,
  tamper: cmdTamper,
  forge: cmdForge,
  prove: cmdProve,
  "check-proof": cmdCheckProof,
  anchor: cmdAnchor,
  selfcheck: cmdSelfcheck,
  bench: cmdBench
};
var run = commands[cmd];
if (!run) {
  console.log(`Tessera \u2014 receipts for agent runs

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
  process.exit(cmd === "help" ? 0 : 2);
}
await run();
