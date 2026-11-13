# 01 — SPEC

## 0. What we are judged on (official, verbatim)

From https://decentralizeai.tech/faq, "What kind of project qualify?":

> Four things: Technical depth (is this a real implementation?); Originality (does it solve
> something unsolved?); Impact (does it meaningfully advance the decentralized AI stack?); and
> Verifiable evidence, such as working code, a deployment URL, or reproducible metrics.
> Mockups, prototypes without demos, and coming-soon projects are not eligible.

And from the same page, the eligible areas include "verifiable and reproducible AI systems",
"permanent model storage", "open inference infrastructure", and "data sovereignty tooling".
Tessera is aimed at *verifiable and reproducible* plus *data sovereignty*.

## 1. Demo script (written first; the build serves this)

| # | Seconds | On screen | Voice-over beat |
|---|---|---|---|
| 1 | 0–7 | A dashboard-shaped card with a blurred log and the line “trust me” stamped on it; then it is torn away | “Every agent gives you a log. None of them gives you evidence.” |
| 2 | 7–17 | Tessera, blank. Cursor presses **Run the agent**. Tiles appear one by one: `read`, `list`, `read`, `redact`, `summarize`, `tally`, `write`, `notify` | “An agent does eight things. Each one becomes a tile: the tool, the arguments, the result, and a hash.” |
| 3 | 17–26 | Press **Seal**. Root and signature appear; a download pill says `run.tessera · 4.3 KB` | “The tiles become one root, signed with the operator's key. Four kilobytes.” |
| 4 | 26–38 | Drag the file onto **Verify**. Verdict card: PASS, 4/4 checks, `31 ms`. The strip stays green | “Anyone can check it — offline, in a browser, with nothing installed.” |
| 5 | 38–52 | Load **tampered** sample: tile 4 cracks red, label “result altered”, the chain arrow after it goes dashed; then **forged**: signature check fails | “One byte changed and it names the step and the field. No key and the seal breaks.” |
| 6 | 52–62 | **Disclose**: choose step 4, a proof of 3 hashes appears, "verify with only this" passes | “And you can prove one step without handing over the rest of the session.” |
| 7 | 62–70 | End card: repo, live URL, "0 external requests", MIT | “Tessera. Receipts an agent cannot edit after the fact.” |

## 2. Acceptance criteria (each one is a command a stranger can run)

| ID | Claim | Check |
|---|---|---|
| AC-1 | A clean bundle verifies | `node scripts/tessera.mjs verify proof/samples/clean.tessera` → exit 0, prints `PASS`, `checks 4/4`, `steps 8` |
| AC-2 | A tampered bundle fails and is localised | `node scripts/tessera.mjs verify proof/samples/tampered.tessera` → exit 1, names `step 4`, field `result`, and the two differing hashes |
| AC-3 | A re-signed-but-forged bundle fails on the signature | `node scripts/tessera.mjs verify proof/samples/forged.tessera` → exit 1, failing check `signature` |
| AC-4 | Bundles stay small | clean bundle ≤ 8 192 bytes for 8 steps |
| AC-5 | Verification is fast | 240-step bundle verifies in < 400 ms (median of 5 runs, this machine) with no network |
| AC-6 | Selective disclosure works alone | `node scripts/tessera.mjs prove proof/samples/clean.tessera --step 4 --out /tmp/p.json` then `check-proof /tmp/p.json` → exit 0 without the bundle; flipping one byte of the disclosed step → exit 1 |
| AC-7 | Tamper localisation is not luck | `node scripts/tessera.mjs selfcheck` → 200 random single-field mutations, 100 % located to the right step **and** field |
| AC-8 | The browser reaches the same verdicts | `npm run e2e` → clean PASS, tampered FAIL at step 4 / field result, forged FAIL at signature |
| AC-9 | Verification needs no network | in the browser, all non-document requests are aborted after load; verification still passes; `performance.getEntriesByType('resource')` external count = 0 |
| AC-10 | A stranger can reproduce everything | fresh clone → `npm install` → `bash scripts/verify.sh` all green |
| AC-11 | Publishing hygiene | MIT; no analytics; no font CDN; visitor-facing copy in English; no credentials in the repo |
| AC-12 | Runs are reproducible | the same seed clock produces the same root on two separate invocations (`scripts/tessera.mjs demo --twice`) |

## 3. Checks the verifier performs

1. **shape** — version, indices are 0..n-1 in order, every `prev` links to the previous `h` or to
   `GENESIS`, no unknown keys in a step.
2. **chain** — for each step, recompute `sha256(canonical(step without h and fc))` and compare with
   `h`. If it differs, compare the five field commitments (`tool`, `args`, `result`, `model`,
   `human`) to say *which* field moved.
3. **root** — recompute the Merkle root over `steps[].h` and compare with `root`.
4. **signature** — ECDSA P-256 / SHA-256 over the UTF-8 string `tessera/v1|<runId>|<root>`,
   verified against `run.operator.publicKeyJwk`.

## 4. Format (v1)

```json
{
  "v": 1,
  "run": {
    "id": "8-byte hex",
    "startedAt": "2026-11-13T09:00:00.000Z",
    "agent": { "name": "courier", "version": "1.0.0" },
    "operator": { "keyId": "…", "publicKeyJwk": { "kty": "EC", "crv": "P-256", … } }
  },
  "steps": [
    {
      "i": 0, "at": "…", "tool": "read", "args": {…}, "result": {…},
      "model": null, "human": { "approved": false },
      "fc": { "tool": "…12 hex", "args": "…", "result": "…", "model": "…", "human": "…" },
      "prev": "0000…0000", "h": "64 hex"
    }
  ],
  "root": "32-byte Merkle root, hex",
  "sig": { "alg": "ECDSA-P256-SHA256", "keyId": "…", "value": "base64url" }
}
```

- Canonical JSON: keys sorted by code unit, `,`/`:` without spaces, no trailing newline, strings
  as JSON, numbers as their shortest round-trip form.
- Merkle: leaf `sha256(0x00 || step.h bytes)`, node `sha256(0x01 || left || right)`, odd node
  promoted unchanged. Root of an empty list is 32 zero bytes.
- `fc` (field commitments) are 12 hex chars (48 bits) — **localisation aids, not security**.
  They exist so a failed step can name the field; the security is `h` (full SHA-256) and the root.

## 5. Scope discipline (after gate A, scope only shrinks)

In: library, CLI, one static page with four panels, samples, tests, docs, video/cover/copy.
Out: Arweave posting, ZK proofs, model attestation, multi-party signatures, key rotation,
server component, accounts, telemetry.
