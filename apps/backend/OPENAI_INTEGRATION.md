# OpenAI Integration

How the backend uses the OpenAI API to turn an uploaded document into canonical
structured JSON. This describes the **implemented** integration (not a spec).

> **Scope of AI in this product.** OpenAI is used for **one thing only: data
> extraction** (document → structured JSON). Compliance pass/fail is decided by a
> deterministic rules engine, never by the model. See *Key Decisions* in
> [INDEX.md](INDEX.md).

---

## At a Glance

| | |
| --- | --- |
| SDK | [`openai`](https://www.npmjs.com/package/openai) `^4.77.0` |
| Model | `gpt-4o` (vision), overridable via `OPENAI_MODEL` |
| API surface | `chat.completions.create` with `response_format: { type: 'json_object' }` |
| Inputs | PDFs as a `file` content part; images as an `image_url` data URL |
| Entry point | `extractDocument()` in `apps/backend/src/services/AIService.ts` |
| Prompts/schemas | `apps/backend/src/services/extractionSchemas.ts` |
| Callers | `DocumentController.extractDocument`, `AiController.aiExtract` |
| Offline mode | `AI_MOCK=1` returns canned data, no key/network needed |

---

## Configuration

Read once at startup in `apps/backend/src/config/env.ts`:

```ts
openaiApiKey: process.env.OPENAI_API_KEY ?? '',
openaiModel:  process.env.OPENAI_MODEL  ?? 'gpt-4o',
aiMock:       process.env.AI_MOCK === '1',
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | `''` | API key. If empty (and not in mock mode), extraction throws `500 OPENAI_API_KEY is not configured`. |
| `OPENAI_MODEL` | `gpt-4o` | Model passed to `chat.completions.create`. Must be vision-capable for image/PDF inputs. |
| `AI_MOCK` | unset | When `1`, bypasses OpenAI entirely and returns canned per-type data. |

The key lives in `apps/backend/.env.example` and
`deployment_scripts/env/backend.env.example` (both blank, to be filled per env).

---

## The Extraction Flow

`extractDocument(opts)` in `AIService.ts` is the single OpenAI call site.

```
ExtractionInput { fileUrl, fileType: 'pdf'|'image', documentType, fileName }
        │
        ├─ AI_MOCK=1 ? ── yes ─→ mockExtraction(documentType) ─→ return canned result
        │                no
        ├─ no OPENAI_API_KEY ? ── yes ─→ throw 500
        │                       no
        ├─ axios.get(fileUrl, arraybuffer, 15s timeout)   ← fetch bytes from media_bucket
        │       └─ on failure ─→ throw 502 "Could not fetch the document file from storage"
        ├─ base64-encode the bytes
        ├─ build content parts:
        │     • { type: 'text', text: '…extract fields as strict JSON…' }
        │     • PDF   → { type: 'file',      file: { filename, file_data: data:application/pdf;base64,… } }
        │     • image → { type: 'image_url', image_url: { url: data:<mime>;base64,… } }
        ├─ client.chat.completions.create({
        │       model: env.openaiModel,
        │       response_format: { type: 'json_object' },     ← forces valid JSON
        │       messages: [
        │         { role: 'system', content: promptForType(documentType) },
        │         { role: 'user',   content: [ …content parts… ] },
        │       ],
        │   })
        │       └─ on failure ─→ throw 502 (err.message)
        ├─ JSON.parse(completion.choices[0].message.content ?? '{}')
        │       └─ on parse failure ─→ throw 502 "AI returned invalid JSON"
        └─ return { data, expirationDate: parseExpiration(data) }
```

Notes:

- **Files are not stored in the backend.** The document bytes live in the
  `media_bucket` service; `extractDocument` fetches them over HTTP from
  `fileUrl` before encoding. See [MEDIA_BUCKET.md](MEDIA_BUCKET.md).
- **Everything is inlined as base64 data URLs** — no OpenAI Files API upload step.
  PDFs go in as a `file` content part, images as an `image_url`. MIME for images
  is inferred from the filename extension (`imageMime()`): jpg/jpeg → `image/jpeg`,
  webp → `image/webp`, gif → `image/gif`, else `image/png`.
- **`response_format: { type: 'json_object' }`** constrains the model to emit a
  single JSON object, so the response is parsed directly with `JSON.parse`.
- The `user` content array is typed as `unknown[]` and cast (`as never`) because
  the SDK's content-part union does not formally include the PDF `file` part —
  intentional, to stay forward-compatible.

---

## Prompts & Per-Type Schemas

`extractionSchemas.ts` owns a `SCHEMAS` map keyed by `documentType`. Each entry has:

- `description` — the exact JSON shape, embedded verbatim into the prompt.
- `mock` — the canned object returned in `AI_MOCK` mode.

Supported document types: **COI, W9, License, Permit, Certificate, Contract,
Other**. Unknown types fall back to **Other**.

`promptForType(documentType)` builds the **system** message:

```
You are a compliance document extraction engine. Extract data from the provided <type> document
and return STRICT JSON exactly matching this shape:

<schema.description>

Rules: Return ONLY the JSON object. Use null (not omission) for any field you cannot find.
Dates must be ISO YYYY-MM-DD. Monetary limits are plain numbers (no currency symbols or commas).
```

The **user** message carries the generic instruction text plus the document
content part(s).

Every schema includes an `expirationDate` field (`null` where not applicable,
e.g. W9). After extraction, `parseExpiration(data)` lifts that field into a real
`Date` (or `null` if absent/unparseable). The caller persists it on the
`Document` so the expiration cron can index and scan it.

---

## Callers & HTTP Surface

Both routes require auth and are wrapped in `costlyLimiter` (see *Rate Limiting*).

### `POST /api/documents/:id/extract` — `DocumentController.extractDocument`
Stateful extraction tied to a document's lifecycle:

1. Set `doc.status = 'extracting'`, save.
2. Call `AI.extractDocument(...)`.
3. On success: store `extractedData` + `expirationDate`, set `status = 'extracted'`, save, return the document.
4. On failure: set `status = 'failed'`, save, and re-throw as an HTTP error using
   the error's tagged `status` (default `502`).

### `POST /api/ai/extract` — `AiController.aiExtract`
Stateless re-extraction primitive. Takes `{ documentId, documentType? }`, runs
extraction against the stored document's `fileUrl`, and returns
`{ extractedData }` **without** mutating document status. Useful for
re-extracting with a different `documentType`.

---

## Error Handling

`extractDocument` produces errors tagged with an HTTP `status` via the `tagged()`
helper, so controllers can surface the right code:

| Condition | Status | Message |
| --- | --- | --- |
| No API key (non-mock) | `500` | `OPENAI_API_KEY is not configured` |
| File fetch from storage failed | `502` | `Could not fetch the document file from storage` |
| OpenAI call threw | `502` | the SDK error message |
| Response was not valid JSON | `502` | `AI returned invalid JSON` |

The file fetch uses a **15-second timeout**. There is no explicit timeout or
retry on the OpenAI call itself — it relies on the SDK's defaults.

---

## Rate Limiting

Both AI endpoints use `costlyLimiter` (`apps/backend/src/middleware/rateLimit.ts`)
to cap cost-incurring calls:

- Window: `RATE_LIMIT_WINDOW_MS` (default 15 min).
- Max: `RATE_LIMIT_MAX` (default 60 requests/window).
- Keyed by authenticated `userId`, falling back to client IP.
- Over-limit → `429 RATE_LIMITED`.

---

## Mock Mode (`AI_MOCK=1`)

Set `AI_MOCK=1` to develop/test without a key or network. `extractDocument`
short-circuits to `mockExtraction(documentType)`, which deep-clones the
per-type `mock` object from `SCHEMAS` and runs it through the same
`parseExpiration` path — so callers get a fully shaped result identical in
structure to a real extraction.

---

## Files

| File | Role |
| --- | --- |
| `apps/backend/src/config/env.ts` | Reads `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_MOCK`. |
| `apps/backend/src/services/AIService.ts` | `extractDocument()` — the only OpenAI call site. |
| `apps/backend/src/services/extractionSchemas.ts` | Per-type schemas, prompt builder, mocks, `parseExpiration`. |
| `apps/backend/src/controllers/DocumentController.ts` | `extractDocument` — stateful extraction. |
| `apps/backend/src/controllers/AiController.ts` | `aiExtract` — stateless re-extraction. |
| `apps/backend/src/routes/documents.ts`, `routes/ai.ts` | Route wiring (auth + `costlyLimiter`). |
| `apps/backend/src/middleware/rateLimit.ts` | `costlyLimiter`. |

---

## Resources

- OpenAI API docs: https://platform.openai.com/docs
- Chat Completions: https://platform.openai.com/docs/api-reference/chat
- Vision / image & file inputs: https://platform.openai.com/docs/guides/vision
- JSON mode: https://platform.openai.com/docs/guides/structured-outputs
