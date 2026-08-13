# Stage 2 confidence capability map

This audit records the confidence and uncertainty evidence that the Braivanta Braille pipeline actually exposes. It deliberately distinguishes OCR evidence from derived agreement and general-purpose AI review findings.

## Capability by granularity

| Granularity | Evidence currently available | Source and meaning | Persisted / safely mappable |
| --- | --- | --- | --- |
| Whole document | Optional provider score | `external_braille_ocr` may return `confidence`. The adapter clamps the supplied value to `[0,1]` but does not reinterpret it or apply a routing threshold. The provider contract does not define calibration or accuracy guarantees. | Persisted with explicit `provider_score` semantics. It is shown as provider document confidence, never as guaranteed correctness. |
| Whole document | Deterministic engine agreement | The hybrid path computes exact character agreement (`1 - CER`) between the primary ABC English draft and a Liblouis back-translation. The engines are correlated because Liblouis consumes the primary engine's detected Braille. | Persisted as `engine_agreement`. It is not labelled OCR confidence and is not used as an accuracy threshold. |
| Whole document | Unavailable | ABC Braille does not supply confidence. Mock output is a fixture. The general-purpose OpenAI Braille draft is not treated as calibrated OCR. Provider failures also have no confidence. | Persisted explicitly as unavailable. Historical records without Stage 2 evidence are also treated as unavailable. |
| Page | Optional provider score and flags | The external adapter accepts optional `pageResults[].confidence` and flags. Missing values remain `null`; they are never converted to zero. No provider thresholds are defined. | Present at the adapter boundary only. Page results are not currently persisted, and page text is not assumed to align with the editable translation. |
| Line | Secondary review finding | The hybrid OpenAI review may return a 1-based line number, exact `sourceText`, issue category, severity, reason, and a suggestion. This is a second-opinion finding, not OCR confidence. | Persisted in the hybrid review. It becomes an interactive item only when the exact excerpt maps unambiguously to visible text. |
| Word / segment | Provider or secondary-review uncertainty flag | External OCR flags and secondary-review findings can name an exact excerpt. Severity is supplied categorically by the underlying source. | Persisted as a bounded review item only for one exact, non-ambiguous match. No segment percentage is invented. |
| Braille cell | Unstructured external payload may contain cell data | `rawCells` is accepted as `unknown`; an external engine may include cell scores or coordinates. No stable schema, semantics, or safe English-text mapping exists. | Not persisted or rendered. Cell provenance is explicitly deferred to Stage 3. |

## Reliability and routing semantics

- No numeric thresholds are introduced in Stage 2.
- A provider score is displayed only when the external OCR provider actually supplied it.
- Engine agreement is deterministic comparison evidence, not a probability or accuracy guarantee.
- General-purpose model self-ratings are not accepted as Braille OCR confidence.
- Provider or reviewer categorical severity maps directly to `review_suggested` or `review_required`; there is no hidden percentage conversion.
- `high` source severity becomes `review_required`. `low` and `medium` become `review_suggested`. These are review-routing states, not scientific accuracy grades.
- The universal specialist-verification requirement remains a workflow gate and is not itself passage confidence.
- Quality evaluation stores and aggregates a numeric `EvalSample.confidence` only for `provider_score` evidence. Hybrid character agreement remains in `primaryLiblouisAgreement` and is labelled separately as engine agreement.
- High-priority issues that cannot be mapped uniquely retain their reason for whole-document specialist review; Braivanta does not invent a text range.

## Persistence and compatibility

Stage 2 fields are additive members inside the existing JSONB task document. No SQL table or column migration is required. Missing `confidenceEvidence`, `reviewItems`, `additionalReviewIssues`, or evaluation evidence-kind values are valid. Historical tasks retain the whole-document review workflow, and historical evaluation numbers without a proven provider-score kind are excluded from provider-score aggregates.

## Deliberately unavailable or deferred

- Calibrated OCR accuracy guarantees.
- Provider-defined confidence thresholds.
- Trustworthy word- or cell-level numeric confidence.
- Cell coordinates, dot patterns, and Braille-cell-to-English traceability.
- UEB or UKAAF rule references and standards versioning.
- Analytics dashboards or longitudinal confidence reporting.
