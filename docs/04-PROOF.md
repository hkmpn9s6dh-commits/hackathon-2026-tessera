# 04 — Proof

Everything here was run on 2026-11-13 on the build machine (Windows 11, Node 22.22.2, Chrome
headless), and the clone check was run on a **fresh clone from GitHub** in a different directory.

## 1. Gate C — a stranger's path

```
git clone https://github.com/hkmpn9s6dh-commits/hackathon-2026-tessera
cd hackathon-2026-tessera
bash scripts/verify.sh
```

Output of that clone (trimmed to the check lines):

```
node available (v22.22.2)                              PASS
npm available                                          PASS
dependencies installed                                 PASS
typescript type check                                  PASS
unit checks (23 passed)                                PASS
production build                                       PASS
published: dist/index.html                             PASS
asset paths are relative (repository subpath)          PASS
fonts are bundled and hashed                           PASS
no font CDN                                            PASS
AC-1 clean bundle verifies                             PASS
AC-2 tampered bundle fails at step 4 / result          PASS
AC-3 forged bundle fails on the signature              PASS
AC-6 disclosure proof verifies alone                   PASS
AC-7 100/100 mutations located to step and field       PASS
anchor data root recomputes                            PASS
AC-12 two seals produce the same root                  PASS
MIT licence present                                    PASS
README documents the verification                      PASS
visitor-facing copy is English                         PASS
no credentials in the repository                       PASS
no third-party analytics                               PASS
browser end-to-end (29/29 checks passed)               PASS
```

The clone also caught nothing new this time — the CRLF trap from the previous entry was closed in
advance with `.gitattributes` (`* text=auto eol=lf`), because a CRLF checkout changes the bytes of
a bundle and therefore every hash in it.

## 2. The three samples, through the CLI

```
$ node bin/tessera.mjs verify proof/samples/clean.tessera
run       run-7-3  courier 1.0.0
steps     12
bytes     6435
shape     PASS  0.28 ms  12 steps, indices and links in order
chain     PASS  8.34 ms  12 step hashes recomputed
root      PASS  1.19 ms  merkle root over 12 leaves matches
signature PASS  1.73 ms  ECDSA P-256 over tessera/v1|run-7-3…
PASS  12 steps · 6435 bytes · 11.67 ms

$ node bin/tessera.mjs verify proof/samples/tampered.tessera
chain     FAIL  7.92 ms  step 4: result changed
...
step 4 · result · field moved: result
FAIL  12 steps · 6449 bytes · 12.84 ms

$ node bin/tessera.mjs verify proof/samples/forged.tessera
chain     PASS  7.55 ms  12 step hashes recomputed
signature FAIL  1.70 ms  signature does not verify
FAIL  sig: signature does not verify against the operator key
```

The tampered bundle has the *same root* as the clean one on purpose: the recorded hashes still form
the same tree, and the content no longer matches its hash. That is the distinct failure a receipt
is supposed to surface.

## 3. Localisation is not luck

```
$ node bin/tessera.mjs selfcheck --rounds 200
selfcheck  200 single-field mutations · 200 located · 0 missed · 100.0% · 1160 ms
```

Each round picks a random step, a random one of the five fields, mutates it, verifies, and requires
the verdict to name **that step and that field**. 200/200, in about 6 ms per verification.

## 4. Size and speed

```
$ node bin/tessera.mjs bench --scale 40
steps        246
bundle       125449 bytes (510 B/step)
seal         64.6 ms
verify       53.4 ms median of 5 (50.1, 51.6, 53.4, 63.5, 71.8)
proof        1682 bytes
verdict      PASS
```

| | |
|---|---|
| 12-step bundle | 6,435 B (536 B/step) |
| 246-step bundle | 125,449 B (510 B/step) |
| 246-step verification | 53.4 ms median (Node, this machine) |
| disclosure proof for step 4 of 12 | 1,662 B, 4 hashes |
| mutations localised | 200/200 |

## 5. Browser, local and live

`node scripts/e2e.mjs` runs 29 checks against the production build; the same script with
`BASE_URL=https://hkmpn9s6dh-commits.github.io/hackathon-2026-tessera/` runs them against GitHub
Pages. Both: **29/29**.

What the 29 cover, in the order a judge would do them:

- clean sample → PASS, four checks, 12 tiles, bytes figure equals the file size, root is 64 hex;
- tampered sample → FAIL, chain fails, the verdict says `step 4: result changed`, exactly one tile
  is marked, that tile names `result`, the detail opens on step 4;
- forged sample → FAIL with `signature` failing while `chain` still passes;
- record → the agent runs 12 steps, seals, downloads a bundle that parses with 12 steps and a
  64-hex root;
- disclose → a proof is produced and verifies on its own;
- anchor → the packet carries `dataRoot` and recomputes from the bundle;
- **0 requests leave the origin** (asserted from `PerformanceResourceTiming`, and shown in the page
  header), fonts are served locally, and verification still passes after every non-local request is
  aborted;
- no page errors, no horizontal scroll at 1440 or 390, verdict readable on a phone.

## 6. Process notes, including the ones that are not flattering

- **Gate D was attempted before the video**, in that order this time: hero screenshots → blind
  ranking → video/cover. On the previous entry the video was made before gate D and had to be
  redone; the order in `AGENTS.md` exists because of that.
- **The demo agent is deterministic.** That is a deliberate limitation, not a hidden one: it is
  what makes 200/200 localisation and a reproducible root possible without a key. `docs/03` says
  what changes with a real model and why it is not in v1.
- **v1 does not post to Arweave.** It builds the packet and recomputes the data root. The claim in
  the README is limited to exactly that.
- **No provider attestation.** A `model` field is a declaration. The word `declared: true` is in
  the format so nobody can mistake it for more.
