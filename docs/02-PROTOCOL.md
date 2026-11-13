# 02 — Protocol v1

## 1. Canonical JSON

Two honest implementations must hash the same run to the same bytes, so the format commits to a
single serialisation:

- object keys sorted by UTF-16 code unit; `,` and `:` with no whitespace; no trailing newline;
- arrays in source order;
- strings escaped as `JSON.stringify` does, **no** unicode normalisation (`e` + U+0301 stays two
  code points and is not the same receipt as `é`);
- numbers as their shortest round-trip decimal (what `JSON.stringify` emits);
- `undefined`, functions, `NaN`, `Infinity` and cycles are rejected, not coerced to `null`.

Implemented in `src/lib/canonical.ts`; tested for key order, non-ASCII bytes and refusals.

## 2. A step

```json
{
  "i": 4,
  "at": "2026-11-13T01:00:04.000Z",
  "tool": "read",
  "args": { "path": "inbox/invoice-0417.txt" },
  "result": { "bytes": 54, "lines": 3 },
  "model": null,
  "human": { "approved": false },
  "prev": "…64 hex…",
  "fc": { "tool": "…12 hex…", "args": "…", "result": "…", "model": "…", "human": "…" },
  "h": "…64 hex…"
}
```

- `h = SHA-256(canonical(step without "h"))`, so `prev` and every commitment are inside the hash.
- `prev` is the previous step's `h`; step 0 uses 64 zeros (`GENESIS`).
- `fc` are **field commitments**: the first 12 hex characters of the SHA-256 of each field's
  canonical form. They exist so a failed step can name the field that moved. 48 bits is plenty for
  localisation and far too little for security — the security is `h` and the root. `h` covers `fc`,
  so a tamperer cannot adjust a commitment to match an edited field without breaking `h`.

## 3. The run

```json
{
  "v": 1,
  "run": { "id": "…", "startedAt": "…", "agent": { "name": "courier", "version": "1.0.0" },
           "operator": { "keyId": "…16 hex…", "publicKeyJwk": { "kty": "EC", "crv": "P-256", … } } },
  "steps": [ … ],
  "root": "…32 bytes…",
  "sig": { "alg": "ECDSA-P256-SHA256", "keyId": "…", "value": "…base64url…" }
}
```

- Merkle leaf: `SHA-256(0x00 ‖ step.h)`; node: `SHA-256(0x01 ‖ left ‖ right)`; an odd node is
  promoted unchanged. Domain separation stops a leaf from being replayed as an interior node.
- Root of an empty run is 32 zero bytes; a run with one step has that step's leaf hash as its root.
- Signature message: the UTF-8 string `tessera/v1|<runId>|<root>`. `keyId` is the first 16 hex of
  the SHA-256 of the operator's public JWK, so a key cannot be swapped without changing its name.

## 4. Verification (what the button does)

1. **shape** — `v === 1`, indices are `0..n-1` in order, every `prev` links (or is genesis), every
   hash and commitment is hex of the right length, `root` is 32 bytes.
2. **chain** — recompute each `h`; if it differs, recompute the five field commitments and report
   the fields that no longer match. This is the step that produces the sentence
   “step 4 · result · field moved: result”.
3. **root** — recompute the Merkle root over the recorded `h` values.
4. **signature** — import the JWK and verify the ECDSA signature over the run message.

A verifier may stop at the first failure or run all four; the CLI and the page both run all four,
because a bundle that fails the chain but passes the signature and the root is exactly the
interesting case (contents edited after sealing).

## 5. Selective disclosure

`proof = { v, runId, root, i, step, path, operator, sig }`.

The recipient recomputes `h` from `step`, walks `path` (⌈log₂ n⌉ hashes) to `root`, and verifies
the signature — without receiving any other step. For 12 steps that is 4 hashes; the proof of step
4 is 1,662 bytes, of which most is the step itself.

## 6. Anchor packet

`dataRoot = base64url(SHA-256(canonical(bundle)))` — over the canonical form, not the file bytes,
so pretty-printing a bundle cannot change what was anchored. The packet carries the tags an
Arweave bundler expects (`App-Name`, `Tessera-Run`, `Tessera-Root`, `Tessera-Steps`,
`Tessera-Key`, `Content-Type`). **v1 does not post**: posting costs AR and needs a wallet. The
packet is the payload, and `checkAnchor` recomputes `dataRoot` from the bundle at any time.

## 7. Threat model, in plain words

| Assumption | Consequence if it fails |
|---|---|
| SHA-256 is collision resistant | an edited step could keep its hash — nothing left to verify |
| ECDSA P-256 is unforgeable | anyone could re-seal a run as the operator |
| The verifier's own page is honest | a hostile page could lie about the verdict; that is why the CLI is 8 KB of readable TypeScript and the checks are printed line by line |
| The operator's key is not stolen | a thief can seal new runs as the operator; receipts already handed out stay valid, which is the point of handing them out |

Out of scope: proving that a *model* actually produced a step (that needs provider attestation),
hiding the disclosed step, and preventing an operator from sealing a false record.
