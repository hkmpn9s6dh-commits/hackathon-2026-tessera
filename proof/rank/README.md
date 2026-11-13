# Gate D — blind ranking

Six images, 1440×900, no labels. Letters were assigned by shuffle; the mapping is in `order.json`
and repeated here for the record:

| Letter | Source |
|---|---|
| A | stripe.com/payments |
| B | are.na |
| C | **ours — the Tessera verifier** |
| D | tailscale.com |
| E | sigstore.dev |
| F | viewblock.io/arweave |

Question put to each judge, verbatim:

> If I am a judge or a user opening this screen, do I want to keep going? Can I grasp what this is
> at a glance?

## Results

| Judge | Model family | Ours | Ranked above | Verdict |
|---|---|---|---|---|
| AME-1371 | GPT-5.6 | **3 / 6** | are.na, viewblock, sigstore | passes (≥ 3 references below) |
| AME-1373 | GLM-5.3-Flash | **3 / 6** | viewblock, are.na, sigstore | passes |
| AME-1374 | DeepSeek-Flash | **3 / 6** | are.na, viewblock, sigstore | passes |

Three judges from three families, none of whom built the thing, all placed it third of six and
above the same three references. The bar in `docs/01-SPEC.md` is "above at least three references";
it is met by the letter, and the two commercial hero pages (Stripe, Tailscale) beat it — that is the
honest reading, and it is recorded rather than argued away.

## What they said about ours (trimmed, translated)

- GPT-5.6: "…the drop zone and the big PASS explain input and value at the same time, and it feels
  technically credible — but it is denser than the two above it."
- GLM-5.3-Flash: "the most complete story of the six — one-line positioning, the PASS result, three
  clickable samples, twelve tiles; it loses half a step because the type is a size smaller and the
  screen is fuller than the two commercial heroes."
- DeepSeek-Flash: "a green PASS and four checks land before anything else — 'it is really running'
  is more direct than the other five; the cost is that the result is 60px and the sentence saying
  what this is sits at 15px in the header."

## What we changed because of it, and what we did not

Changed: one tile label (`summarise`) collided with its step number at 92px width — fixed, and a
duplicate `signature` row in the forged verdict was removed. Both are defects the judges named, and
both are visible in the ranked image.

Not changed: the hierarchy complaint (a 60px verdict next to a 15px identity line). Fixing it means
redesigning the first screen, which would invalidate the ranking that just passed. It is logged as
the first thing to change on the next entry, in `docs/04-PROOF.md` §6.

## Files

- `A.jpg` … `F.jpg` — the set the judges saw.
- `src/` — the untrimmed captures, named by source.
- `order.json` — the letter → source mapping written when the set was built.
- `brief.md` — the instructions the judges received.
