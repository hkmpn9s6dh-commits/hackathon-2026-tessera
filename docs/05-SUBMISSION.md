# 05 — Submission copy

Two places need words: the HackerNoon story (which is the entry) and the DecentralizeAI.tech
submission. Both are below, ready to paste.

## 1. HackerNoon story

**Title**

> Receipts, Not Dashboards: 6 KB That Proves What Your Agent Did — Offline

**Subtitle**

> Every agent hands you a log. None of them hands you evidence. Tessera is a small, open format for
> the missing object: a receipt you can check with the network unplugged.

**Tags** (HackerNoon allows up to five; the first is the contest tag and must be there)

```
Decentralize AI Hackathon, Decentralize AI, AI Infrastructure, Open Source, Developer Tools
```

**Body** — `submission/hackernoon-article.md`, verbatim. About 1,500 words, one code block, two
tables, no images required (the site adds a cover from the first image if one is present; use
`submission/cover-1500x1000.png` as the story image).

**Canonical / cross-post** — leave empty. This is the original.

## 2. DecentralizeAI.tech

**Project name**

> Tessera

**One line**

> Offline-verifiable receipts for AI agent runs: a 6 KB file that names the step and the field that
> changed after sealing, and a Merkle proof that discloses one step without the rest of the session.

**What layer of the stack it touches**

> Verifiable and reproducible AI systems, plus data sovereignty tooling. The verifier is static
> files; the root is designed to be anchored on Arweave for permanence.

**Short description (≤ 600 characters)**

> An agent finishes a job and hands over a `.tessera` file — about 500 bytes per step, chained by
> SHA-256, sealed under one Merkle root and signed with the operator's key. Anyone can drop it into
> a static page with the network unplugged and learn whether the run changed after sealing, which
> step, and which field. A Merkle path lets the operator disclose one step without handing over the
> other eleven. MIT, no runtime dependencies, 200/200 single-field mutations located to the right
> step and field.

**Links**

- Repo: https://github.com/hkmpn9s6dh-commits/hackathon-2026-tessera
- Live verifier: https://hkmpn9s6dh-commits.github.io/hackathon-2026-tessera/
- Article: (paste the HackerNoon URL once published)
- Video: (paste the YouTube URL once uploaded)

**Evidence to quote if there is a field for it**

> 12-step bundle 6,435 bytes; 246-step bundle verifies in 53.4 ms (Node, median of 5); disclosure
> proof 1,662 bytes; 200/200 mutations localised; 0 cross-origin requests during verification;
> fresh clone → `bash scripts/verify.sh` → all checks pass, 29/29 in the browser.

## 3. What NOT to claim

- Do not say the receipts are "cryptographically proven true" — they are proven unchanged.
- Do not say it posts to Arweave. It builds the packet.
- Do not say it attests the model. The field is a declaration.

Those three sentences are the whole difference between a credible entry and a demo that falls over
under one question from a judge.
