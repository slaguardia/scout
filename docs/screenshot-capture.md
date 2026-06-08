# Screenshot capture — spec (not yet built)

Add a company or job by **pasting a screenshot** of a page scout can't fetch.
The motivating case is Crunchbase: it blocks server-side fetches and gates data
behind your login, so scout can never fetch it — but your browser already has
the rendered page on screen. A screenshot sidesteps both bot-blocking and login
walls, and it works the same way for any gated page (LinkedIn, a PDF job spec, a
recruiter email).

This is the successor to an earlier paste-the-page-text idea (a clipboard
bookmarklet feeding a text blob to the extractor). Screenshots win on UX —
`Cmd+Shift+4` → `Cmd+V` → Add, no browser setup — and on robustness (no scraping
brittle DOM/`__NEXT_DATA__`). It reuses ~90% of the existing capture path.

## The one-line model

A screenshot is just another input to the **same** one-shot extractor the Add
dialog already runs. Instead of fetching a page and handing its text to Haiku,
hand Haiku the image(s). Classification + field extraction + every downstream
write (company upsert, enrichment seed, posting upsert) are unchanged — see
`internal/capture/capture.go`.

## UX (the Add dialog)

- A **drop/paste zone**: "drop or paste a screenshot." Three ways in,
  best-first: **paste an image from the clipboard** (`Cmd+V`), drag-drop an
  image file, file-picker fallback.
- Thumbnail previews of attached shots, each with an ✕ to remove. Allow **1–4
  images** — Crunchbase company pages are long, so let the user grab the
  overview plus the funding/headcount sections.
- Same rules as the link box: the zone is gated on `ANTHROPIC_API_KEY` (vision
  always uses the model), and the source URL is **optional** (still required for
  a *job*, which needs a URL to attach to / dedup on).

## API

`POST /api/capture` gains an `images` field:

```json
{ "kind": "company_page",
  "url": "(optional source link)",
  "images": [{ "media_type": "image/png", "data": "<base64>" }],
  "fields": { "...": "user-typed overrides, win over extraction" } }
}
```

Raise the request body ceiling (several base64 PNGs run multi-MB), or switch
this path to `multipart/form-data` and stream. Client downscaling (below) keeps
it modest either way.

## Server (mirrors the capture flow)

- `capture.Request` gains `Images []ImageInput{MediaType, Data}`.
- New `runImages` path — no fetch, no ATS resolve — builds a multimodal user
  message (image blocks + the existing extraction instruction), calls the
  extractor, parses the **same** `extraction` JSON contract, applies
  `ext.apply(fields)` and the shared write path. Nothing downstream changes.
- One-line tweak to the extractor system prompt: "you are given screenshots of
  the page" instead of "the fetched page's text." The same "never invent" rule
  carries over — the model extracts only what's visible.
- Vision always requires the key (never the keyless ATS shortcut), same guard as
  the existing LLM path.

## Model — Haiku (confirmed)

Extract on **`claude-haiku-4-5`** (the same model the text extractor already
uses; full id `claude-haiku-4-5-20251001`). Confirmed vision-capable — no beta
header, no opt-in. Notes that drive the implementation:

- **Standard resolution cap (~1568px long edge, ~1600 tokens/image).** The
  high-resolution vision path (2576px, pixel-accurate coordinates) is Opus
  4.7/4.8-only; Haiku stays at the standard cap. That's fine here, and it means
  the client should **downscale to ≤1568px on the long edge** before upload —
  smaller and cheaper, with no fidelity lost to the cap anyway.
- **Image content block (base64), over scout's raw HTTP path.** Drops into the
  existing `anthropic.Message.Content any` field as a content array:

  ```json
  { "role": "user",
    "content": [
      { "type": "image",
        "source": { "type": "base64", "media_type": "image/png", "data": "<base64>" } },
      { "type": "text", "text": "<extraction instruction>" }
    ] }
  ```

  `media_type` ∈ `image/png` | `image/jpeg` | `image/gif` | `image/webp`.
  Multiple screenshots = multiple `image` blocks before the `text` block. This
  is the only new client plumbing — a small image-block helper in
  `internal/anthropic`.
- **Cost.** Haiku is $1/1M input, $5/1M output. A downscaled screenshot is
  ~1–1.5K input tokens (capped ~1600); 1–4 per add is a fraction of a cent, and
  the extraction output is the same ~400-token JSON. Escalate to Sonnet only if
  dense Crunchbase layouts come out thin.

## Limits to set

- Max images per request (4), max bytes/image, total request size.
- Client-side downscale to ≤1568px long edge (canvas) before base64.

## Out of scope

- No OCR/preprocessing — the vision model reads the image directly.
- Scout still never submits anything anywhere; this only drafts/writes
  scout-local rows, same as every other capture path.

## Rough effort

~A day: ~½ day server + the anthropic image-block helper, ~½ day the dialog
drop/paste zone and previews. Low risk — the extraction contract, the shared
write path, and the key-gating already exist; this adds an input modality, not a
new pipeline.
