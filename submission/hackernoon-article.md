# Receipts, Not Dashboards: 6 KB That Proves What Your Agent Did — Offline

*Every agent hands you a log. None of them hands you evidence. Tessera is a small, open format for
the missing object: a receipt you can check with the network unplugged.*

---

An agent reads three invoices, redacts the phone numbers, writes a digest, and asks before it
notifies anyone. Something goes wrong later — a number in the digest is wrong, or a phone number
that should have been redacted is sitting in an email. You open the vendor's dashboard and find a
log. It is a web page. It is owned by the party you are now arguing with. It has a "download CSV"
button that produces a file anyone could have typed.

That is not evidence. Evidence is something that would look different if it were false.

For agents working inside one company, this is an inconvenience. For agents working *between*
companies — the direction everything is heading — it is a blocker. Two agents that do not share a
server need a way to settle what happened without either of them being the authority. The
counterparty cannot accept "trust my logs", and the operator should not have to hand over the raw
session to prove one step of it.

## What we built

**Tessera** turns a run into a receipt: a JSON file of about 500 bytes per step, sealed under one
Merkle root and signed with the operator's key. Anyone can drop it into a static page and learn
three things in under 100 ms, with no account, no API and no network:

1. did the run change after it was sealed?
2. at which step?
3. in which field?

And a fourth thing, which is the part that makes it usable between parties: an operator can
**disclose one step** — with a proof of ⌈log₂ n⌉ hashes — without handing over the other eleven.

The demo is a deterministic agent so that every byte is reproducible. In the browser you press
*Run the agent*, watch twelve tiles land, press *Seal*, and get a 6,435-byte file. Drag that file
back into the page and it verifies in about 12 ms on a quiet machine, 40–90 ms in a busy browser tab. Load the tampered sample and exactly one tile
cracks: it turns oxide red, the label under it reads `result`, and the detail panel shows the
recomputed hash next to the recorded one.

The live verifier: **https://hkmpn9s6dh-commits.github.io/hackathon-2026-tessera/** — the page is
static files, and the header counts cross-origin requests. It says 0 because there are none.

## The format, in one page

A step is the unit. It carries what the agent did, what came back, and the previous step's hash:

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

`h = SHA-256(canonical(step without "h"))`. Canonical means one serialisation and only one: keys
sorted by code unit, no whitespace, shortest round-trip numbers, no unicode normalisation. Two
implementations that disagree about `é` would produce two different roots for the same run, and a
receipt format that depends on the author's normalisation habit is not a receipt format.

`prev` is inside the hash, so a step cannot be moved without breaking its own hash. Step 0 starts
at sixty-four zeros. The run's identity is a Merkle root over the step hashes — leaf
`SHA-256(0x00 ‖ h)`, node `SHA-256(0x01 ‖ left ‖ right)`, odd nodes promoted — and the root is
signed with ECDSA P-256 over the string `tessera/v1|<runId>|<root>`.

The `fc` object holds twelve hex characters of each field's hash. It is not security — 48 bits is
nothing — it is *readability*. When a step fails, those commitments are what let the verifier say
"the `result` field moved" instead of "something in step 4 is wrong". The step hash covers `fc`, so
a tamperer cannot quietly adjust a commitment to match an edited field.

## What the four checks actually catch

| Check | Recomputes | Catches |
|---|---|---|
| shape | version, indices, `prev` links, hex lengths | spliced, reordered or truncated runs |
| chain | every step hash, then the field commitments | edited contents, and names the field |
| root | the Merkle root over the recorded hashes | a swapped or re-rooted set of steps |
| signature | ECDSA over the run message | a bundle re-sealed under a different key |

The interesting sample is the *forged* one: the chain passes, the root passes, and the signature
fails. That is the shape of an attacker who has the file but not the key — and it is the case a
dashboard would never show you, because a dashboard only has one notion of "logged in".

## Numbers, not adjectives

Run on a laptop (Node 22, Windows 11), and reproducible with the commands in the repo:

| | |
|---|---|
| 12-step bundle | 6,435 bytes (536 B/step) |
| 246-step bundle | 125,449 bytes (510 B/step) |
| 246-step verification | 53.4 ms median of 5 (Node) |
| disclosure proof, step 4 of 12 | 1,662 bytes, 4 hashes |
| single-field mutations located to step **and** field | 200/200 |
| cross-origin requests while verifying | 0 |

The localisation number is the one worth pausing on. 200 random mutations across five fields, and
every one of them came back with the right step and the right field name. That is not a demo
trick; it is what the commitments buy.

## What it does not prove

This matters more than the feature list, because the failure mode of "verifiable AI" is
overclaiming.

- **Tessera proves the record was not changed. It does not prove the record is true.** An agent
  that lies can seal its lie perfectly. The signature says "this operator recorded this", not "this
  happened".
- **A `model` field is a declaration, not an attestation.** v1 writes `declared: true` into the
  format so nobody can mistake it for proof about which weights were served. Provider attestation
  is a different layer, and it is not in this build.
- **Selective disclosure hides the other steps; it does not make the disclosed step private.** If
  you prove step 7, step 7 is disclosed.
- **No Arweave transaction is posted.** The build produces the exact anchor packet — data root over
  the canonical bundle, plus the tags a bundler expects — and stops there, because posting costs AR
  and needs a wallet. Anyone can recompute the data root from the bundle and compare.

Those limits are in the README in the same words. A tool about evidence that is fuzzy about its own
claims would be a joke at its own expense.

## Why this is decentralized infrastructure and not a SaaS feature

Three reasons, in order of how much they matter:

1. **The verifier has no owner.** It is 40 KB of JavaScript and a few fonts. Fork it, mirror it,
   put it on a USB stick. There is no endpoint to shut down, no account to revoke, no API key that
   expires. A verification story that depends on the vendor's server being up is not a verification
   story.
2. **The root can be made permanent without a platform.** The anchor packet is designed for
   Arweave: post the bundle once, and the root outlives both parties' infrastructure. Permanent
   model storage and permanent *evidence* storage are the same problem seen from two ends.
3. **Disclosure is a data-sovereignty primitive.** The reason operators hand over raw sessions is
   that partial proof was impossible. With Merkle paths, the minimum disclosure is one step. That
   changes what a compliance review, an incident report or a settlement between two agents actually
   requires.

Concretely: an agent that books, pays or files on someone's behalf can now return a receipt along
with the result. The other side verifies it offline. If a dispute arises a month later, the receipt
still checks out — and it checks out even if both companies have changed their logging stacks in
the meantime, because the check never touches a server.

## Try it in thirty seconds

```
git clone https://github.com/hkmpn9s6dh-commits/hackathon-2026-tessera
cd hackathon-2026-tessera
node bin/tessera.mjs verify proof/samples/clean.tessera      # PASS
node bin/tessera.mjs verify proof/samples/tampered.tessera   # FAIL — step 4 · result
node bin/tessera.mjs verify proof/samples/forged.tessera     # FAIL — signature
```

No `npm install` for those three lines: the CLI is bundled and committed as an 8 KB file. The full
check — typecheck, 23 unit tests, build, every claim in the README, and 29 browser checks against a
real Chrome — is `bash scripts/verify.sh`.

## The part I would do next

- **Provider attestation.** A receipt is much stronger when the `model` field is signed by the
  provider rather than declared by the operator. That needs providers to sign inference responses;
  it is the highest-value missing piece.
- **A second signature.** Today the operator signs. For settlement between two agents, both should.
- **Anchoring for real.** Posting one bundle to Arweave turns "I have a file" into "the file has an
  address that cannot be edited or taken down". That is a wallet and a few dollars away, and it is
  deliberately not faked in this build.

If you want to argue with the format, the protocol doc is `docs/02-PROTOCOL.md`, and the failing
cases are one command each. That is the point: a receipt is only worth something if the person
holding it can check it without asking you.

---

*Tessera is MIT-licensed. Built for the Decentralize AI Hackathon (HackerNoon × Nosana × Arweave ×
MEXC), Round 2. Repo:
https://github.com/hkmpn9s6dh-commits/hackathon-2026-tessera · Live verifier:
https://hkmpn9s6dh-commits.github.io/hackathon-2026-tessera/*
