export const FIELDS = ['tool', 'args', 'result', 'model', 'human'] as const;
export type FieldName = (typeof FIELDS)[number];

export type JsonWebKeyLite = JsonWebKey;

export type ModelDecl = {
  /** What the agent says produced this step, e.g. "local-policy-v1" or "deepseek-chat". */
  id: string;
  provider?: string;
  /** Optional digest of weights, when the operator knows it. */
  weights?: string;
  /** v1 only records a declaration; it is not an attestation. */
  declared: true;
};

export type Human = { approved: boolean; by?: string };

export type StepBody = {
  i: number;
  at: string;
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  model: ModelDecl | null;
  human: Human;
  prev: string;
};

export type StepDraft = Omit<StepBody, 'i' | 'prev'>;

export type Step = StepBody & {
  fc: Record<FieldName, string>;
  h: string;
};

export type Operator = { keyId: string; publicKeyJwk: JsonWebKey };

export type RunMeta = {
  id: string;
  startedAt: string;
  agent: { name: string; version: string };
  operator: Operator;
};

export type Sig = { alg: 'ECDSA-P256-SHA256'; keyId: string; value: string };

export type Bundle = {
  v: 1;
  run: RunMeta;
  steps: Step[];
  root: string;
  sig: Sig;
};

export type CheckName = 'shape' | 'chain' | 'root' | 'signature';

export type Check = { name: CheckName; ok: boolean; ms: number; detail: string };

export type Failure = { step: number; field: FieldName | 'hash' | 'prev' | 'root' | 'sig'; note: string };

export type Verdict = {
  ok: boolean;
  checks: Check[];
  failures: Failure[];
  steps: number;
  bytes: number;
  ms: number;
  root: string;
  rootRecomputed: string;
};

export type Proof = {
  v: 1;
  runId: string;
  root: string;
  i: number;
  step: Step;
  path: { side: 'L' | 'R'; h: string }[];
  operator: Operator;
  sig: Sig;
};
