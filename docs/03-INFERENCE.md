# 03 — Recording a run whose steps come from a real model

The demo agent is deterministic on purpose (see `docs/00-BRIEF.md`): a receipt you cannot
reproduce is hard to argue with. But the format does not care where a step came from. This page is
the seam.

## 1. What a model step looks like

A step that involved a model carries a declaration:

```json
"model": { "id": "deepseek-chat", "provider": "openai-compatible", "weights": "…optional sha256…", "declared": true }
```

`declared: true` is part of the format. v1 records what the operator says produced the step; it
does not attest the served weights. Pretending otherwise would be the exact sin this project is
about, so the field name says `declared`.

## 2. The recorder loop (any OpenAI-compatible endpoint)

```ts
// pseudo-code; the shape is what matters
for (const call of plan) {
  const body = { model, messages, temperature, seed };
  const started = new Date().toISOString();
  const res = await fetch(`${baseUrl}/chat/completions`, { method: 'POST', body: JSON.stringify(body) });
  const json = await res.json();
  drafts.push({
    at: started,
    tool: 'model.complete',
    args: { model, messages_sha256: await sha256Hex(canonical(body.messages)), temperature, seed },
    result: { choices: json.choices.length, text_sha256: await sha256Hex(json.choices[0].message.content) },
    model: { id: model, provider: 'openai-compatible', declared: true },
    human: { approved: false },
  });
}
```

Two rules keep the receipt useful:

1. **Never put the prompt or the completion in the bundle** unless the operator chooses to. Store
   the SHA-256. A receipt that leaks the session is not a receipt, it is a transcript.
2. **Record what you sent, not what you meant to send.** Hash the body you actually posted, after
   defaults are filled in.

## 3. Determinism, honestly

With `temperature: 0` and a fixed `seed`, two calls to the same provider *usually* agree; nothing
contractually guarantees it, and a provider may change the model behind a stable name. That is why
`model.weights` is optional and why the receipt records a hash of the output rather than claiming
it can be regenerated. A verifier checks *integrity*, not *reproducibility*; reproducibility is the
operator's own claim and can be tested separately by re-running and comparing `text_sha256`.

## 4. Why this build ships a deterministic agent

- Judges can reproduce the exact root with one command, on any machine, without a key.
- The interesting claim (the seal, the localisation, the selective disclosure) is visible without
  a network call, which is the whole point of an offline verifier.
- The failure modes of a model call (rate limits, model drift, provider outages) would obscure the
  failure modes of the receipt.

The adapter above is the work of an afternoon and is deliberately not in v1: adding it would mean
shipping a demo that only runs with a key, and the receipt format is the part that needs to be
right first.
