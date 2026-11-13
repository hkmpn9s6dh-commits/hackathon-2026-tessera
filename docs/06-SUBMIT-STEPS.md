# 06 — How to submit (for the operator, about 20 minutes)

The entry **is** the HackerNoon story: the contest FAQ and `contests.hackernoon.com` both say that
publishing with the contest tag is what enters you. The DecentralizeAI.tech side is where the
sponsor prizes and the compute credits live.

## A. Publish the story (10 minutes)

1. Sign in or create an account at <https://hackernoon.com/signup>.
2. **Write → New story.**
3. Title, exactly:

   ```
   Receipts, Not Dashboards: 6 KB That Proves What Your Agent Did — Offline
   ```

4. Subtitle, exactly (it is the first line of `docs/05-SUBMISSION.md` §1).
5. Body: paste everything from `submission/hackernoon-article.md` **except** its first line (the
   title). Keep the code block and both tables — HackerNoon's editor renders both.
6. Tags, in this order:

   ```
   Decentralize AI Hackathon
   Decentralize AI
   AI Infrastructure
   Open Source
   Developer Tools
   ```

   The first tag is the contest tag. Without it the story is just a story.
7. Story image: upload `submission/cover-1500x1000.png`.
8. Publish. HackerNoon editors review before it goes live; that is normal for a new account and can
   take a day or two. The earlier it goes in, the longer it collects reading time, which is part of
   how the shortlist is made.

## B. DecentralizeAI.tech (10 minutes)

1. Open <https://decentralizeai.tech/> and claim the participant credits at
   <https://decentralizeai.tech/claim/nosana> (free, $70 of Nosana compute; it is one of the prize
   lines and it also makes the "built with sponsor credits" claim true if we later run a GPU step).
2. Submit the project. The site's submit entry appears after sign-in; if no form appears on the day,
   send the following to the address on the site's contact page (and keep the receipt):

   ```
   Project: Tessera — offline-verifiable receipts for agent runs
   Repo:    https://github.com/hkmpn9s6dh-commits/hackathon-2026-tessera
   Live:    https://hkmpn9s6dh-commits.github.io/hackathon-2026-tessera/
   Article: <HackerNoon URL>
   Video:   <YouTube URL>
   Round:   2 (submissions close 2027-02-27)
   ```

3. Paste the short description and the evidence line from `docs/05-SUBMISSION.md` §2 into whichever
   fields exist.

## C. If a judge asks

| Question | Answer |
|---|---|
| "Is this a real implementation?" | `bash scripts/verify.sh` — 23 unit checks, every claim, 29 browser checks, on a fresh clone |
| "What does it prove?" | that the record was not changed after sealing, and which field moved — not that the record is true |
| "Where is the Arweave transaction?" | there isn't one; the packet and the data root are produced, posting is paid and not faked |
| "Is the model attested?" | no; `declared: true` is in the format on purpose |
| "Why a deterministic agent?" | so the root is reproducible without a key; `docs/03-INFERENCE.md` is the seam for a real model |
