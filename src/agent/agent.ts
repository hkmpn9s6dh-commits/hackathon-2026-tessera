/**
 * The demo agent.
 *
 * Deliberately deterministic: no model, no network, fixed clock. That is the point of the demo —
 * every judge should be able to reproduce the same root from the same seed, and the receipt format
 * should be inspectable without an API key. Real providers plug in at `model` (see docs/03).
 */

import type { ModelDecl, StepDraft } from '../lib/types';

export type { StepDraft };

export type Run = {
  meta: { id: string; startedAt: string; agent: { name: string; version: string } };
  drafts: StepDraft[];
  /** Rendered digest the agent wrote, so the UI can show the work, not just hashes. */
  digest: string;
};

const PHONE = /\b\d{3}-\d{4}-\d{4}\b/g;

type Invoice = { id: string; vendor: string; amount: number; phone: string; note: string };

const INVOICES: Invoice[] = [
  { id: '0412', vendor: 'Northwind Cables', amount: 128400, phone: '021-5566-7788', note: 'Brake housing, 40 m' },
  { id: '0417', vendor: 'Kestrel Bearings', amount: 86250, phone: '0755-2233-4455', note: 'Sealed bearings, 24 pcs' },
  { id: '0421', vendor: 'Loom & Spoke', amount: 21900, phone: '010-8899-1122', note: 'Spoke blanks, 200 pcs' },
];

const money = (cents: number): string => `${(cents / 100).toFixed(2)} CNY`;

function stamp(seed: number, index: number): string {
  // Fixed base so two runs with the same seed hash to the same root.
  const base = Date.UTC(2026, 10, 13, 1, 0, 0) + seed * 1000;
  return new Date(base + index * 1000).toISOString();
}

export type RunOptions = { seed?: number; scale?: number };

export function courierRun(options: RunOptions = {}): Run {
  const seed = options.seed ?? 7;
  const scale = Math.max(1, Math.floor(options.scale ?? 1));
  const drafts: StepDraft[] = [];
  let n = 0;
  const at = (): string => stamp(seed, n);

  const push = (draft: Omit<StepDraft, 'at'>): void => {
    drafts.push({ ...draft, at: at() });
    n += 1;
  };

  const files = Array.from({ length: 3 * scale }, (_, i) => {
    const base = INVOICES[i % INVOICES.length] as Invoice;
    const round = Math.floor(i / INVOICES.length);
    return { ...base, id: `${base.id}${round === 0 ? '' : `-${round + 1}`}`, path: `inbox/invoice-${base.id}${round === 0 ? '' : `-${round + 1}`}.txt` };
  });

  push({
    tool: 'list',
    args: { path: 'inbox' },
    result: { entries: files.map((f) => f.path), count: files.length },
    model: null,
    human: { approved: false },
  });

  push({
    tool: 'read',
    args: { path: 'inbox/manifest.json' },
    result: { bytes: 214, records: files.length, policy: 'redact phone numbers before summarizing' },
    model: null,
    human: { approved: false },
  });

  const parsed: { id: string; vendor: string; amount: number }[] = [];
  for (const file of files) {
    const phone = file.phone;
    const before = `${file.vendor} — ${money(file.amount)} — contact ${phone}`;
    push({
      tool: 'read',
      args: { path: file.path },
      result: { bytes: before.length, lines: 3 },
      model: null,
      human: { approved: false },
    });
    const after = before.replace(PHONE, '[[phone]]');
    push({
      tool: 'redact',
      args: { path: file.path, rule: 'phone' },
      result: { removed: phone.match(PHONE)?.length ?? 0, preview: after },
      model: null,
      human: { approved: false },
    });
    parsed.push({ id: file.id, vendor: file.vendor, amount: file.amount });
  }

  const total = parsed.reduce((sum, p) => sum + p.amount, 0);
  const model: ModelDecl = { id: 'local-policy-v1', provider: 'tessera-demo', declared: true };
  push({
    tool: 'summarise',
    args: { inputs: parsed.map((p) => p.id), style: 'four bullets' },
    result: {
      bullets: parsed.map((p) => `${p.vendor}: ${money(p.amount)}`),
      total: money(total),
    },
    model,
    human: { approved: false },
  });

  push({
    tool: 'tally',
    args: { currency: 'CNY' },
    result: { count: parsed.length, total_cents: total, total: money(total) },
    model: null,
    human: { approved: false },
  });

  const digest = [
    `# Invoice digest — ${parsed.length} records`,
    '',
    ...parsed.map((p) => `- ${p.vendor} · ${p.id} · ${money(p.amount)}`),
    '',
    `Total: ${money(total)}`,
    '',
    'Phone numbers were redacted before the digest was written.',
  ].join('\n');

  push({
    tool: 'write',
    args: { path: 'out/digest.md', bytes: digest.length },
    result: { written: true, preview: digest.split('\n')[0] ?? '' },
    model: null,
    human: { approved: false },
  });

  push({
    tool: 'notify',
    args: { channel: 'email', to: 'ops@example.invalid', subject: 'Invoice digest ready' },
    result: { queued: true, requires_approval: true },
    model: null,
    human: { approved: true, by: 'operator' },
  });

  return {
    meta: {
      id: `run-${seed}-${parsed.length}`,
      startedAt: stamp(seed, 0),
      agent: { name: 'courier', version: '1.0.0' },
    },
    drafts,
    digest,
  };
}
