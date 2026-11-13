/**
 * Canonical JSON: one byte string per value, so that two honest implementations of this format
 * hash the same run to the same root. Rules (Tessera v1):
 *
 *   - objects: keys sorted by UTF-16 code unit, no whitespace, `"k":v`
 *   - arrays: source order, no whitespace
 *   - strings: JSON escaping, no unicode normalisation (byte-for-byte what the author wrote)
 *   - numbers: shortest round-trip form (what JSON.stringify emits)
 *   - null / true / false: as-is
 *
 * Anything else (undefined, functions, BigInt, NaN, Infinity, cycles) is a bug at the call site,
 * not a value to encode: we throw instead of silently writing `null`.
 */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export function canonical(value: unknown): string {
  return write(value, new Set());
}

function write(value: unknown, seen: Set<object>): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'string') return JSON.stringify(value);
  if (t === 'number') {
    const n = value as number;
    if (!Number.isFinite(n)) throw new Error('canonical: non-finite number');
    // JSON.stringify gives the shortest round-trip decimal for doubles.
    return JSON.stringify(n);
  }
  if (t !== 'object') throw new Error(`canonical: unsupported type ${t}`);
  const obj = value as object;
  if (seen.has(obj)) throw new Error('canonical: cycle');
  seen.add(obj);
  try {
    if (Array.isArray(obj)) {
      const parts: string[] = [];
      for (const item of obj) {
        if (item === undefined) throw new Error('canonical: undefined in array');
        parts.push(write(item, seen));
      }
      return `[${parts.join(',')}]`;
    }
    const rec = obj as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = rec[k];
      if (v === undefined) throw new Error(`canonical: undefined at ${k}`);
      parts.push(`${JSON.stringify(k)}:${write(v, seen)}`);
    }
    return `{${parts.join(',')}}`;
  } finally {
    seen.delete(obj);
  }
}
