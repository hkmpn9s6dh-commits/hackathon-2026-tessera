# 00 — Brief

**Tessera** — receipts for AI agents that anyone can check offline.

An agent finishes a job and hands over a `.tessera` file: a few kilobytes listing every step it
took, chained by SHA-256, sealed under one Merkle root, signed with the operator's key.
Anyone can drop that file into a web page that talks to nothing, and learn three things in
under 100 ms: did the run change after it was sealed, at which step, and which field.

## Why it exists

Agent work is now real work: it reads your files, redacts, files, pays, deletes. The only record
usually lives in the vendor's dashboard — mutable, unexportable, and trusted on faith. For
agent-to-agent work on open networks there is a second problem: the *counterparty* needs to
verify the same run without trusting the operator's server, and without receiving the raw
session.

Tessera is the small piece that makes both possible:

- **Integrity without a server.** The verifier is static files. No API, no account, no network.
- **Selective disclosure.** A Merkle proof reveals one step and nothing else: 4 hashes prove
  that step 7 belongs to the sealed run, without handing over steps 1–6.
- **Optional permanence.** The root can be anchored on Arweave. This build produces the exact
  anchor packet; posting it is a separate, paid step and is not performed here.

## What it is not

- Not a proof that the agent told the truth. A lying agent can seal a lie. Tessera proves
  *this is exactly what the agent recorded*, not *what it recorded was correct*. The docs say so
  in the same words.
- Not a zero-knowledge system. Selective disclosure hides the other steps; it does not make the
  disclosed step private.
- Not an attestation of the model. A run may *declare* a model id; only a provider signature
  would make that a claim about weights actually served. v1 records the declaration and marks it
  as declared.

## Who it is for

1. An operator who wants to hand a client evidence instead of a screenshot.
2. A client or auditor who wants to check that evidence without installing anything.
3. Two agents on an open network that must settle a task without a shared server.

## Delivery

- MIT library + CLI (TypeScript, no runtime dependencies).
- Static verifier on GitHub Pages: run, verify, disclose, anchor.
- `scripts/verify.sh`: typecheck, unit, production build, hygiene, browser end-to-end.
- Docs 00–08, reproducible metrics in `docs/04-PROOF.md`.
