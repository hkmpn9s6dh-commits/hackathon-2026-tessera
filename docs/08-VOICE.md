# 08 — Voice-over

Picture lock: `video/raw/take.webm` → `video/tessera-demo.mp4` (silent, captions burned in).
Record the voice separately and mux: put it at `video/voice.wav`, then `node scripts/video.mjs`.

Target: **66–72 seconds**, calm, one idea per sentence. Times are from the start of the picture.

| Time | Say | On screen |
|---|---|---|
| 0:00–0:07 | “Every agent hands you a log. A web page — owned by the party you are now arguing with. That is not evidence.” | clean page, first caption |
| 0:07–0:17 | “So here is a different object. An agent does twelve small things: it reads three invoices, redacts the phone numbers, writes a digest, and asks before it notifies anyone. Each step becomes a tile — the tool, the arguments, the result, and a hash of all three.” | Record panel, tiles landing |
| 0:17–0:26 | “Seal the run, and twelve hashes become one Merkle root, signed with the operator's key. Six kilobytes.” | seal, root and key appear |
| 0:26–0:36 | “Anyone can check that file. Offline. In a browser. Nothing installed. In the time it takes to blink.” | clean sample verifies |
| 0:36–0:47 | “Change one field after sealing and it does not just fail — it names step four, and says the result moved.” | tampered sample, red tile |
| 0:47–0:55 | “Re-sign it with another key and the chain still adds up, but the seal breaks.” | forged sample |
| 0:55–1:04 | “And you can prove a single step with four hashes, without handing over the other eleven. That is the part that makes receipts usable between two companies.” | Disclose panel, proof verifies |
| 1:04–1:10 | “Tessera. Receipts an agent cannot edit after the fact.” | end card |

## Recording notes

- Say **“TESS-uh-ruh”** (tessera: one tile of a mosaic). Do not spell it out.
- “Merkle” = *MER-kl*. “SHA-256” = *S-H-A two-fifty-six*.
- Numbers: “six kilobytes”, “four hashes”, “eleven”. Do not say a millisecond figure on the voice track — in a busy browser tab it ranges from 12 to 90 ms, and the article gives the range.
- Leave ~0.4 s of silence at the start and 0.8 s at the end; the mux does not trim.
- One take is fine. If a line goes wrong, restart the sentence, not the whole thing — the editor is
  a text file, not a tape.

## Muxing

```bash
node scripts/video.mjs            # video/voice.wav + video/raw/take.webm → video/tessera-demo.mp4
node scripts/video.mjs --no-voice # silent picture, for anyone who wants to caption it themselves
```

The script normalises loudness to −16 LUFS and refuses to run if the voice is shorter than the
picture by more than 3 seconds (that is a sign the read was rushed).
