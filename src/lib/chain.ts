/** Step hashing, field commitments, and the localisation that makes a failure readable. */

import { canonical } from './canonical';
import { sha256Hex } from './hash';
import { FIELDS, type FieldName, type Step, type StepBody } from './types';

/** What `h` commits to: the whole step body plus the field commitments, minus `h` itself. */
export type Sealed = Omit<Step, 'h'>;

export async function commitments(body: Pick<StepBody, 'tool' | 'args' | 'result' | 'model' | 'human'>): Promise<Record<FieldName, string>> {
  const out = {} as Record<FieldName, string>;
  for (const f of FIELDS) {
    out[f] = (await sha256Hex(canonical(body[f]))).slice(0, 12);
  }
  return out;
}

export async function stepHash(body: StepBody, fc: Record<FieldName, string>): Promise<string> {
  return sha256Hex(canonical({ ...body, fc }));
}

/** Recompute the hash of a stored step and say which fields no longer match their commitment. */
export async function inspect(step: Step): Promise<{ hash: string; moved: FieldName[] }> {
  const body: StepBody = {
    i: step.i,
    at: step.at,
    tool: step.tool,
    args: step.args,
    result: step.result,
    model: step.model,
    human: step.human,
    prev: step.prev,
  };
  const hash = await stepHash(body, step.fc);
  const recomputed = await commitments(body);
  const moved = FIELDS.filter((f) => recomputed[f] !== step.fc[f]);
  return { hash, moved };
}
