import '../styles.css';
import cleanRaw from '../samples/clean.tessera?raw';
import tamperedRaw from '../samples/tampered.tessera?raw';
import forgedRaw from '../samples/forged.tessera?raw';
import { courierRun } from '../agent/agent';
import { anchorPacket, checkAnchor } from '../lib/anchor';
import { byteLength, sealRun, serialise, verifyBundle } from '../lib/bundle';
import { inspect } from '../lib/chain';
import { makeProof, verifyProof } from '../lib/proof';
import { generateOperator } from '../lib/sign';
import type { Bundle, Check, Verdict } from '../lib/types';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const SAMPLES: Record<string, string> = { clean: cleanRaw, tampered: tamperedRaw, forged: forgedRaw };
const LABEL: Record<string, string> = { clean: 'clean.tessera', tampered: 'tampered.tessera', forged: 'forged.tessera' };

let current: { bundle: Bundle; verdict: Verdict; name: string } | null = null;
let recorded: Bundle | null = null;
let proof: Awaited<ReturnType<typeof makeProof>> | null = null;
let packet: Awaited<ReturnType<typeof anchorPacket>> | null = null;

/* ------------------------------------------------------------------ self-audit */

function externalRequests(): number {
  if (typeof performance === 'undefined' || !performance.getEntriesByType) return 0;
  try {
    return (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) => {
      try {
        return new URL(e.name).origin !== location.origin;
      } catch {
        return false;
      }
    }).length;
  } catch {
    return 0;
  }
}

function paintAudit(): void {
  const n = externalRequests();
  $('audit-count').textContent = String(n);
  $('foot-requests').textContent = n === 0 ? '0 requests to other origins' : `${n} requests to other origins`;
}

/* ------------------------------------------------------------------ verdict */

function checkRow(c: Check): string {
  return `<tr><td class="c-name">${c.name}</td><td class="c-state ${c.ok ? 'pass' : 'fail'}">${c.ok ? 'PASS' : 'FAIL'}</td><td class="c-ms">${c.ms.toFixed(2)} ms</td><td class="c-detail">${c.detail}</td></tr>`;
}

function paintVerdict(): void {
  const word = $('verdict-word');
  if (!current) {
    word.textContent = '—';
    word.className = 'verdict-word';
    $('verdict-file').textContent = 'nothing loaded';
    $('checks').innerHTML = '';
    return;
  }
  const { verdict, name } = current;
  word.textContent = verdict.ok ? 'PASS' : 'FAIL';
  word.className = `verdict-word ${verdict.ok ? 'pass' : 'fail'}`;
  $('verdict-file').textContent = name;
  const rows = verdict.checks.map(checkRow);
  const extra = verdict.failures
    .filter((f) => f.step >= 0)
    .slice(0, 2)
    .map((f) => `<tr><td class="c-name">step ${f.step}</td><td class="c-state fail">!</td><td class="c-ms"></td><td class="c-detail"><b>${f.field}</b> · ${f.note}</td></tr>`);
  $('checks').innerHTML = [...rows, ...extra].join('');
  $('f-steps').textContent = String(verdict.steps);
  $('f-bytes').textContent = `${verdict.bytes.toLocaleString('en-US')} B`;
  $('f-ms').textContent = `${verdict.ms.toFixed(1)} ms`;
  $('f-root').textContent = verdict.root || '—';
}

/* ------------------------------------------------------------------ strip */

async function paintStrip(): Promise<void> {
  const strip = $('strip');
  strip.innerHTML = '';
  $('detail').hidden = true;
  if (!current) {
    $('strip-hint').textContent = 'select a sample above';
    return;
  }
  const { bundle, verdict } = current;
  const failingSteps = new Map<number, string>();
  for (const f of verdict.failures) {
    if (f.step >= 0) failingSteps.set(f.step, f.field);
  }
  for (const [i, step] of bundle.steps.entries()) {
    const li = document.createElement('li');
    const badField = failingSteps.get(i);
    li.className = `tile${badField ? ' bad' : ''}`;
    li.dataset.i = String(i);
    li.tabIndex = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-pressed', 'false');
    const note = badField ? `<span class="tile-note">${badField}</span>` : `<span class="tile-hash">${step.h.slice(0, 8)}</span>`;
    li.innerHTML = `<span class="tile-i">${String(i).padStart(2, '0')}</span><span class="tile-tool">${step.tool}</span>${note}`;
    li.addEventListener('click', () => void showDetail(i));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') void showDetail(i);
    });
    strip.append(li);
  }
  const stepFindings = verdict.failures.filter((f) => f.step >= 0).length;
  $('strip-hint').textContent = verdict.ok
    ? `${verdict.steps} steps · every hash recomputed`
    : stepFindings > 0
      ? `${stepFindings} finding${stepFindings === 1 ? '' : 's'} · click the red tile`
      : 'the chain is intact · the seal is not';
  if (!verdict.ok) {
    const firstBad = [...failingSteps.keys()][0];
    if (firstBad !== undefined) await showDetail(firstBad);
  }
}

async function showDetail(index: number): Promise<void> {
  if (!current) return;
  const step = current.bundle.steps[index];
  if (!step) return;
  document.querySelectorAll('.tile').forEach((t) => t.setAttribute('aria-pressed', String(t.getAttribute('data-i') === String(index))));
  const { hash, moved } = await inspect(step);
  const match = hash === step.h;
  const detail = $('detail');
  detail.hidden = false;
  detail.innerHTML = `
    <div class="detail-head">
      <h3>step ${index} · ${step.tool}</h3>
      <span class="mono">${step.at}${step.model ? ` · ${step.model.id}` : ''}${step.human.approved ? ' · human approved' : ''}</span>
    </div>
    <dl>
      <dt>arguments</dt><dd class="pre">${escapeHtml(JSON.stringify(step.args, null, 1))}</dd>
      <dt>result</dt><dd class="pre">${escapeHtml(JSON.stringify(step.result, null, 1))}</dd>
      <dt>hash</dt><dd>${step.h}</dd>
      <dt>recomputed</dt><dd style="color:${match ? 'var(--ledger)' : 'var(--oxide)'}">${hash}${match ? '' : `  ← ${moved.join(', ') || 'contents'} changed`}</dd>
      <dt>prev</dt><dd>${step.prev}</dd>
      <dt>commitments</dt><dd>${Object.entries(step.fc).map(([k, v]) => `${k} ${v}`).join(' · ')}</dd>
    </dl>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
}

/* ------------------------------------------------------------------ loading samples */

async function loadSample(name: string): Promise<void> {
  const raw = SAMPLES[name];
  if (!raw) return;
  const bundle = JSON.parse(raw) as Bundle;
  const verdict = await verifyBundle(bundle);
  current = { bundle, verdict, name: LABEL[name] ?? `${name}.tessera` };
  document.querySelectorAll<HTMLButtonElement>('.sample').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sample === name)));
  paintVerdict();
  await paintStrip();
  $('proof-step').setAttribute('max', String(bundle.steps.length - 1));
  $('proof-step').setAttribute('value', String(Math.min(4, bundle.steps.length - 1)));
}

async function loadFile(file: File): Promise<void> {
  const text = await file.text();
  let bundle: Bundle;
  try {
    bundle = JSON.parse(text) as Bundle;
  } catch {
    $('verdict-file').textContent = `${file.name} — not JSON`;
    return;
  }
  const verdict = await verifyBundle(bundle);
  current = { bundle, verdict, name: `${file.name} · ${file.size} B` };
  document.querySelectorAll<HTMLButtonElement>('.sample').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  paintVerdict();
  await paintStrip();
}

/* ------------------------------------------------------------------ record */

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function runAgent(): Promise<void> {
  const run = courierRun({ seed: 7 });
  const strip = $('record-strip');
  strip.innerHTML = '';
  $('record-status').textContent = 'running…';
  for (const [i, draft] of run.drafts.entries()) {
    await new Promise((r) => setTimeout(r, 85));
    const li = document.createElement('li');
    li.className = 'tile';
    li.innerHTML = `<span class="tile-i">${String(i).padStart(2, '0')}</span><span class="tile-tool">${draft.tool}</span><span class="tile-hash">…</span>`;
    strip.append(li);
  }
  const signer = await generateOperator();
  const bundle = await sealRun(run.meta, run.drafts, signer);
  for (const [i, step] of bundle.steps.entries()) {
    const tile = strip.children[i];
    if (tile) {
      const hash = tile.querySelector('.tile-hash');
      if (hash) hash.textContent = step.h.slice(0, 8);
    }
  }
  recorded = bundle;
  (document.getElementById('seal-run') as HTMLButtonElement).disabled = true;
  (document.getElementById('download-run') as HTMLButtonElement).disabled = false;
  $('record-status').textContent = `${bundle.steps.length} steps · sealed · ${byteLength(bundle)} bytes`;
  const out = $('record-out');
  out.hidden = false;
  out.innerHTML = `
    <dl>
      <dt>run</dt><dd>${bundle.run.id} · ${bundle.run.agent.name} ${bundle.run.agent.version}</dd>
      <dt>root</dt><dd>${bundle.root}</dd>
      <dt>key</dt><dd>${bundle.run.operator.keyId}</dd>
      <dt>sealed</dt><dd>${byteLength(bundle)} bytes · 8 steps · ECDSA P-256</dd>
    </dl>`;
}

/* ------------------------------------------------------------------ panels */

async function onProof(): Promise<void> {
  if (!current) return;
  const index = Number(($('proof-step') as HTMLInputElement).value);
  proof = await makeProof(current.bundle, Math.max(0, Math.min(index, current.bundle.steps.length - 1)));
  const out = $('proof-out');
  out.hidden = false;
  out.textContent = JSON.stringify({ ...proof, step: { ...proof.step, args: '…', result: '…' } }, null, 2);
  (document.getElementById('check-proof') as HTMLButtonElement).disabled = false;
  $('proof-verdict').textContent = `${proof.path.length} hashes · ${new TextEncoder().encode(JSON.stringify(proof)).length} bytes · only this step is disclosed`;
  $('proof-verdict').className = 'proof-verdict';
}

async function onCheckProof(): Promise<void> {
  if (!proof) return;
  const verdict = await verifyProof(proof);
  const p = $('proof-verdict');
  p.textContent = verdict.checks.map((c) => `${c.name} ${c.ok ? 'PASS' : 'FAIL'} — ${c.detail}`).join('   ·   ');
  p.className = `proof-verdict ${verdict.ok ? 'pass' : 'fail'}`;
}

async function onAnchor(): Promise<void> {
  if (!current) return;
  packet = await anchorPacket(current.bundle);
  const out = $('anchor-out');
  out.hidden = false;
  out.textContent = JSON.stringify(packet, null, 2);
  (document.getElementById('check-anchor') as HTMLButtonElement).disabled = false;
  $('anchor-verdict').textContent = '';
}

async function onCheckAnchor(): Promise<void> {
  if (!packet || !current) return;
  const ok = await checkAnchor(current.bundle, packet);
  const p = $('anchor-verdict');
  p.textContent = ok ? `PASS — dataRoot ${packet.dataRoot.slice(0, 22)}… recomputed from the bundle` : 'FAIL — dataRoot does not match the bundle';
  p.className = `proof-verdict ${ok ? 'pass' : 'fail'}`;
}

/* ------------------------------------------------------------------ wiring */

export async function boot(): Promise<void> {
  paintAudit();
  for (const name of ['clean', 'tampered', 'forged']) {
    const raw = SAMPLES[name] ?? '';
    const el = document.querySelector(`[data-bytes="${name}"]`);
    if (el) el.textContent = `${new TextEncoder().encode(raw).length.toLocaleString('en-US')} B`;
  }

  document.querySelectorAll<HTMLButtonElement>('.sample').forEach((b) => {
    b.addEventListener('click', () => void loadSample(b.dataset.sample ?? 'clean'));
  });

  const drop = $('drop');
  const file = $('file') as HTMLInputElement;
  drop.addEventListener('click', () => file.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') file.click();
  });
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    if (f) void loadFile(f);
  });
  for (const type of ['dragenter', 'dragover']) {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.add('hot');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.remove('hot');
    });
  }
  drop.addEventListener('drop', (e) => {
    const f = (e as DragEvent).dataTransfer?.files?.[0];
    if (f) void loadFile(f);
  });

  $('copy-root').addEventListener('click', () => {
    void navigator.clipboard?.writeText($('f-root').textContent ?? '');
    $('copy-root').textContent = 'copied';
    setTimeout(() => ($('copy-root').textContent = 'copy'), 1200);
  });

  $('run-agent').addEventListener('click', () => void runAgent());
  $('seal-run').addEventListener('click', () => {
    if (recorded) void loadSample('clean');
  });
  $('download-run').addEventListener('click', () => {
    if (recorded) download('run.tessera', serialise(recorded));
  });
  $('make-proof').addEventListener('click', () => void onProof());
  $('check-proof').addEventListener('click', () => void onCheckProof());
  $('make-anchor').addEventListener('click', () => void onAnchor());
  $('check-anchor').addEventListener('click', () => void onCheckAnchor());

  const wanted = new URLSearchParams(location.search).get('sample');
  await loadSample(wanted && SAMPLES[wanted] ? wanted : 'clean');
  setInterval(paintAudit, 1500);
}

void boot();
