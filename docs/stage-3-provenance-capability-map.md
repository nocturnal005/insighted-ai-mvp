# Stage 3 provenance capability audit

This audit records only evidence exposed by the current Braivanta adapters and their actual contracts. `SUPPORTED` means the evidence and its semantics are both established; `PARTIAL` means useful evidence exists but is not sufficient for the target capability; `UNAVAILABLE` means the path does not expose it; `UNVERIFIED` means a shape or value may exist but its meaning is not established.

## Sources inspected

- Braivanta runtime types, Zod schemas, provider adapters, persistence actions, fixtures, Stage 2 tests, and review UI at the Stage 3 baseline.
- The external OCR engine at the exact app-pinned revision [`ead99513c584fa7a22351ec6aa735b6a3cb9bc70`](https://github.com/nocturnal005/insighted-braille-ocr-engine/tree/ead99513c584fa7a22351ec6aa735b6a3cb9bc70), including its [response models](https://github.com/nocturnal005/insighted-braille-ocr-engine/blob/ead99513c584fa7a22351ec6aa735b6a3cb9bc70/app/models/responses.py), [line reconstruction](https://github.com/nocturnal005/insighted-braille-ocr-engine/blob/ead99513c584fa7a22351ec6aa735b6a3cb9bc70/app/ocr/line_reconstruction.py), [pipeline](https://github.com/nocturnal005/insighted-braille-ocr-engine/blob/ead99513c584fa7a22351ec6aa735b6a3cb9bc70/app/ocr/pipeline.py), and [sample response](https://github.com/nocturnal005/insighted-braille-ocr-engine/blob/ead99513c584fa7a22351ec6aa735b6a3cb9bc70/samples/sample_response.json).
- The ABC offline contract fixture, hybrid contract fixture, general-vision structured response schema, mock fixture, and Liblouis CLI adapter.

The external engine contract proves that `rawCells[]` means detected 6-dot cells with a 1-based line number, a 1-based grid cell index, numbered dots, a detected-cell bounding box `[left, top, right, bottom]`, and a per-cell detector heuristic. It does **not** prove stable provider cell IDs, original-source coordinates, page dimensions, English mappings, calibrated probabilities, alternatives, or raw model predictions. The provider may normalize, rotate, resize, or crop before detection and returns no inverse transform, so its boxes cannot safely highlight the displayed source image.

## Capability matrix

| Capability | `external_braille_ocr` | `abc_braille_web` | `abc_openai_review` / hybrid | general vision | mock | Liblouis / back-translation |
| --- | --- | --- | --- | --- | --- | --- |
| Page identity | PARTIAL — Braivanta can assign a local page ID, but the provider supplies no stable page ID | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| Page number | SUPPORTED — the fixed response contains `pageResults[].pageNumber` | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| Page dimensions | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| Braille cells | SUPPORTED for records matching the pinned v1 contract | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNVERIFIED — `rawCells` exists only as an unused `unknown` input |
| Provider cell IDs | UNAVAILABLE — line/index is geometry, not a stable provider ID | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| Source coordinates | PARTIAL — coordinates refer to a provider working image with no source transform | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| Bounding boxes | SUPPORTED as provider working-image detected-cell boxes; not source highlights | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| Dot patterns | SUPPORTED as numbered 6-dot positions | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNVERIFIED as a possible input, not an output |
| Raw Braille | SUPPORTED as Unicode Braille | SUPPORTED as ordered lines scraped from `Braille Scanned` | SUPPORTED from the ABC primary path | UNAVAILABLE | UNAVAILABLE | PARTIAL — accepted as input when an upstream path supplies it |
| Normalized symbols | SUPPORTED by deterministic dot-pattern-to-Unicode conversion | PARTIAL — Unicode Braille is present but no typed cell records exist | PARTIAL through ABC raw Braille | UNAVAILABLE | UNAVAILABLE | PARTIAL as the upstream Unicode input |
| Per-cell confidence | SUPPORTED as an uncalibrated provider detector heuristic | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| Alternatives | UNAVAILABLE | UNAVAILABLE | PARTIAL — secondary review may suggest English text, never Braille cell alternatives | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| Raw predictions | UNAVAILABLE — the raw response body is deliberately not persisted | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE — only validated draft/flags are retained | UNAVAILABLE | UNAVAILABLE |
| Page confidence | SUPPORTED as a provider heuristic, not calibrated accuracy | UNAVAILABLE | UNAVAILABLE — engine agreement is document comparison evidence, not page confidence | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |
| Line-level evidence | PARTIAL — cells have line numbers, but no line-to-English mapping | PARTIAL — ordered Braille and English line lists exist without an asserted one-to-one mapping | PARTIAL — secondary findings may include English line numbers/excerpts | UNAVAILABLE | UNAVAILABLE | PARTIAL — newlines may survive whole-document input/output without alignment metadata |
| Word/segment evidence | PARTIAL — blank grid positions and raw Braille exist without English segments | UNAVAILABLE | PARTIAL — exact English excerpts may become Stage 2 review items | PARTIAL — exact English flag text may become a review item | UNAVAILABLE | UNAVAILABLE |
| Mapping to English text | UNAVAILABLE — whole-document back-translation has no trace map | UNVERIFIED — two ordered lists exist, but the adapter does not establish element alignment | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE — the CLI returns whole translated text only |
| Mapping to English offsets | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE for Braille-to-English; Stage 2 can map an English review excerpt only | UNAVAILABLE for source-to-English; Stage 2 can map an English flag only | UNAVAILABLE | UNAVAILABLE |
| Model/provider/version metadata | PARTIAL — adapter/provider/model metadata exists, but runtime engine revision is not returned by arbitrary endpoints | PARTIAL — provider, workflow model, requested table and adapter version exist | PARTIAL — primary/reviewer/back-translator labels exist, with private identities redacted in staff UI | SUPPORTED for configured provider, model, prompt, mode and timing | SUPPORTED as explicit mock metadata only | PARTIAL — engine label exists; configured table/version is not persisted with each result |
| Standards/table metadata | UNAVAILABLE in the response; flags may describe a path but do not identify authoritative runtime configuration | PARTIAL — Braivanta requests `en-ueb-g2.ctb`, but ABC does not echo proof of the applied table | PARTIAL — requested/configured table context exists but is not complete run provenance | UNAVAILABLE | UNAVAILABLE | PARTIAL — a configured table is passed to the CLI but not retained in the result |
| Source-image crop coordinates | UNAVAILABLE — no inverse transform to the original upload | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE | UNAVAILABLE |

## Implemented provenance boundary

- Braivanta's configured standards decision-support registry is not provider/run provenance. A rule being evaluated by Braivanta does not prove that the OCR provider applied that standard or translation table.
- `TranscriptionProvenance` contains only evidence about the OCR/transcription run. It does not carry Braivanta's UEB rule profile.
- Only `external_braille_ocr` records that pass the exact typed cell schema become `CellEvidence`.
- Every cell receives a Braivanta-owned ID beginning `braivanta-cell-`; `providerCellId` remains `null` because the provider does not supply one.
- Provider working-image boxes are retained with `sourceImageAligned: false`; no crop or highlight is generated.
- ABC and hybrid records may retain page-level raw Braille, but never cells or English mappings.
- General vision and mock paths remain explicitly unavailable.
- All mappings stay empty. Historical tasks with no provenance remain valid.
- Evidence is included in the client view only for an authorised Braille specialist; server-side action guards independently enforce the same specialist boundary.

## Standards audit and scope

The authoritative standard is the ICEB [Rules of Unified English Braille, Third Edition 2024](https://iceb.org/Rules%20of%20Unified%20English%20Braille%202024.pdf). ICEB identifies that rulebook as definitive. UKAAF [identifies ICEB as the authoritative UEB source](https://www.ukaaf.org/standards/ueb/) and supplements it with UK guidance, but no additional UKAAF rule is encoded in this stage because the available provenance does not justify a reliable UK-specific automated check.

One bounded rule is registered: `UEB-6.1.1`, limited to recognising the twelve numeric-indicator sequences listed in section 6.1. Every new evaluation separately records why Braivanta considered UEB applicable. The current application establishes that context only for its explicitly configured ABC and hybrid UEB workflows; the configuration is decision-support context and is not proof that the provider applied UEB. Other paths, including external OCR with raw Braille but no explicit UEB context, receive `insufficient_evidence` rather than an inferred UEB result.

Where the Braivanta UEB context is explicitly established, the rule can report `consistent` when an exact raw-Braille sequence exists, `not_applicable` when none exists, or `insufficient_evidence` when raw Braille is unavailable. It does not infer a conflict from absence because the print context is unavailable, and it does not assess the remainder or termination of numeric mode.

Early Stage 3 evaluation records that do not contain an applicability basis remain readable, but the UI presents them conservatively as `insufficient_evidence` and does not permit a new confirmation decision based on the missing context.

These results are decision support only. They are not comprehensive UEB or UKAAF coverage and are not compliance certification.
