# InsightEd AI MVP

> Secure, human-verified accessibility workflow for visual impairment education teams.

InsightEd AI is a controlled-demo and pilot-readiness MVP for mainstream secondary school VI support workflows. The workflow mechanics are functional: role checks, specialist verification, teacher feedback approval, audit logging, exports, local persistence, upload metadata, and retention deletion.

The AI/OCR layer is now provider-based. It ships with a safe, offline **mock mode** for demos and a **real mode** that can call OpenAI vision (for visual/STEM descriptions and a clearly-labelled non-specialist Braille draft) or an external Braille OCR endpoint. Every AI output is a draft carrying provider/model/confidence/uncertainty metadata, and Braille accuracy always requires specialist verification before teacher feedback or export.

## Run It

```bash
npm install
npm run reset:demo
npm run dev
```

Open http://localhost:3000.

`npm run reset:demo` clears local demo records and uploads so the seeded walkthrough data is recreated on the next app start.

## MVP Mode

This MVP is designed for controlled demonstration and validation. It uses human-in-the-loop review for all AI outputs.

> This MVP produces AI/OCR drafts only. It must not be used with identifiable pupil data, live assessment materials, or school production workflows until data protection, safeguarding, authentication, storage, and specialist verification arrangements are approved.

### Environment variables

Copy `.env.example` to `.env` and adjust. Missing keys never crash the app — an unconfigured real provider returns a controlled "provider unavailable" draft instead.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEMO_MODE` | `true` | Enables the local staff-picker login. Set `DEMO_MODE=false` before wiring Supabase Auth or another identity provider. |
| `AI_MODE` | `mock` | `mock` uses safe offline providers. `real` uses configured real providers. |
| `AI_PROVIDER` | `openai` | Real vision/text provider (currently `openai`). Invalid values fall back to mock. |
| `OPENAI_API_KEY` | _(empty)_ | Server-only OpenAI key. Never logged, shown, or audited. |
| `OPENAI_VISION_MODEL` | `gpt-4.1` | Vision model for visual/STEM/Braille-draft. |
| `OPENAI_TEXT_MODEL` | `gpt-4.1` | Text model (reserved for future text-only steps). |
| `BRAILLE_OCR_PROVIDER` | `mock` | `mock` \| `openai_vision_draft` \| `external_braille_ocr`. |
| `BRAILLE_OCR_ENDPOINT` | _(empty)_ | HTTPS endpoint for the external Braille OCR adapter. |
| `BRAILLE_OCR_API_KEY` | _(empty)_ | Server-only bearer token for that endpoint. |
| `BRAILLE_OCR_TIMEOUT_MS` | `30000` | Request timeout for the external Braille OCR endpoint. |
| `LIBLOUIS_ENABLED` | `false` | Enable the optional Liblouis back-translation CLI. Off by default. |
| `LIBLOUIS_COMMAND` | _(empty)_ | Path to a `lou_translate`-style CLI (only used when enabled). |
| `LIBLOUIS_TABLE` | `en-ueb-g2.ctb` | Liblouis translation table. |
| `LIBLOUIS_TIMEOUT_MS` | `5000` | Timeout for the Liblouis CLI call. |
| `MAX_UPLOAD_MB` | `10` | Upload size cap enforced centrally in preprocessing/validation. |
| `ALLOWED_UPLOAD_TYPES` | `image/png,image/jpeg,image/jpg,application/pdf` | Accepted upload MIME types (includes `image/jpg`). |
| `ALLOW_REAL_PUPIL_DATA` | `false` | Safety flag; keep `false` for demos/pilots. When `false`, a pupil-linked task run through a real provider raises a high-severity warning. |

### Run in mock mode (default, no keys)

```env
AI_MODE=mock
```

Deterministic, offline drafts. Braille still requires specialist verification; nothing is presented as final. This is the safe demo path.

### Run in real OpenAI mode

```env
AI_MODE=real
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
BRAILLE_OCR_PROVIDER=openai_vision_draft
```

Visual and STEM descriptions and the Braille draft are generated from the uploaded image. OpenAI Braille output is explicitly a **non-specialist draft**, uses conservative confidence, and always requires QTVI/Braille-literate verification. On any provider or JSON-validation failure the app returns a controlled fallback draft with a high-severity flag — raw provider errors and secrets are never surfaced.

## AI/OCR Provider Architecture

All AI/OCR lives behind `src/lib/ai/` and is reached through three functions in `src/lib/ai/index.ts`:

```ts
transcribeBraille(input)     // Braille OCR draft (always needs specialist verification)
describeVisual(input)        // Assessment-safe neutral description
describeStemVisual(input)    // Structured STEM description
```

Pipeline per call: config resolution → image preprocessing (`sharp`) → provider dispatch → `zod` validation of provider JSON → confidence scoring → uncertainty flags → provenance metadata (provider, model, prompt version, mode, processing time) → audit log.

Providers under `src/lib/ai/providers/`:

* **mock-provider** — deterministic offline drafts for every capability; powers demo mode.
* **openai-vision-provider** — OpenAI vision for visual/STEM descriptions and a labelled non-specialist Braille draft (`visual-description-v1`, `stem-description-v1`, `braille-openai-draft-v1`).
* **external-braille-provider** — adapter for a specialist Braille OCR HTTP engine.
* **braille-translation-provider** — Liblouis-ready back-translation interface (optional; stubbed).

### External Braille OCR endpoint contract

When `BRAILLE_OCR_PROVIDER=external_braille_ocr`, the adapter POSTs to `BRAILLE_OCR_ENDPOINT` (with `Authorization: Bearer <BRAILLE_OCR_API_KEY>` if set):

Request:

```json
{ "taskId": "…", "title": "…", "fileName": "…", "mimeType": "…", "dataUrl": "…", "subject": "… | null", "yearGroup": "… | null" }
```

Response (validated with `zod`):

```json
{
  "draftText": "…",
  "confidence": 0.82,
  "rawBraille": "optional unicode braille",
  "rawCells": [],
  "flags": [{ "text": "…", "reason": "…", "category": "unclear_braille_cell", "severity": "medium" }],
  "pageResults": []
}
```

A missing endpoint returns a `provider_unavailable` draft; a failed call returns a `processing_failed` draft. Both still require specialist verification.

### Liblouis-ready back-translation

`braille-translation-provider.ts` defines a clean `BrailleTranslationProvider` interface for converting detected Braille (Unicode dot patterns or cell arrays) **into** print text. This is back-translation that runs **after** a dot/cell-detection OCR stage — it is **not** an image OCR engine and cannot read a photograph on its own.

Liblouis is intentionally optional and controlled by env:

* `LIBLOUIS_ENABLED=false` (default) — the provider reports `provider_unavailable`; the build never depends on a native Liblouis binding or on Duxbury.
* `LIBLOUIS_ENABLED=true` with `LIBLOUIS_COMMAND` pointing at a `lou_translate`-style CLI — the provider shells out (with `LIBLOUIS_TIMEOUT_MS`) to back-translate, feeding the Braille on stdin against `LIBLOUIS_TABLE`. A missing or slow binary degrades gracefully and never crashes the app.

When the external Braille OCR adapter returns raw Braille, it optionally invokes this provider and records whether Liblouis was available (it never overrides the engine's own draft text). Liblouis is **never** required for `npm install`, `npm run typecheck`, or `npm run build`. Duxbury is not used.

### Real pupil data safety

Identifiable pupil data must never be sent to a real provider without school data-protection approval. Two protections enforce this:

* **Minimal context only.** AI calls receive title, subject, year group, question prompt, assessed skill, and the image — **never** pupil names or identifiers. The provider input carries only a boolean `hasLinkedPupil`.
* **Explicit guard.** `assertRealAiDataAllowed` (in `src/lib/ai/safety.ts`) raises a high-severity warning flag when `AI_MODE=real` and a pupil-linked task runs while `ALLOW_REAL_PUPIL_DATA=false`. It warns and audits rather than silently proceeding; it does not block the demo workflow.

### Re-running AI/OCR

Every module exposes an explicit **Re-run AI/OCR** control and a server action (`rerunBrailleTranscription`, `rerunVisualDescription`, `rerunStemDescription`). Re-runs reuse the stored upload, refresh provider/model/confidence/prompt/flag metadata, preserve approval locks (a specialist-verified transcription or an approved description cannot be re-run unless an admin reopens it), and record the previous draft in the audit reason so a regeneration never silently discards edits. Assessment tasks can also edit the question prompt / assessed skill / context / hint tier after creation and regenerate so answer-sensitivity is re-evaluated.

### Upload validation

All upload validation is centralised in `src/lib/ai/config.ts` (`validateUpload` / `getUploadLimits`) and shared by every module via `src/lib/upload-guard.ts`. Accepted types and the size cap are driven by `ALLOWED_UPLOAD_TYPES` and `MAX_UPLOAD_MB`; oversized or unsupported files are rejected before any provider call.

### Audit provenance

`ai.*` and `eval.run` audit entries record provider, model, confidence, processing time, AI mode, **prompt version**, and a concise **flag summary** (e.g. `high: requires_specialist_review`). Raw provider responses, base64 image data, API keys, and prompt payloads are never stored in audit entries or task records. Full uncertainty flags (severity + category) are preserved on task/eval records in an `aiFlags` field for review and analytics.

### Quality evaluation

The evaluation harness (`/quality`) scores the active engine with CER/WER. Samples **with** an image are sent through `transcribeBraille` (respecting `AI_MODE` and the configured Braille provider) and record provider/model/confidence/flags. Text-only samples fall back to deterministic mock simulation and are labelled `mock` so they are never mistaken for a real OCR measurement. Samples carry governance metadata (subject, year group, Braille type, image quality, sample source, permission status), and the page shows aggregate metrics (average CER/WER/confidence, counts by provider and Braille type, most common flag categories) plus a data-protection warning: **evaluation samples must be synthetic or anonymised unless school permission and data-protection approval are confirmed**. Every staff verification also captures an (AI draft → verified final) correction pair — free labelled data for measuring and later fine-tuning a real engine.

### Validation commands

```bash
npm run validate:ai     # AI/OCR behavioural guarantees (provider routing, fallbacks, caps, safety)
npm run validate:mvp    # workflow/RBAC + AI/OCR presence & no-old-mock-calls checks
npm run validate:demo   # demo-readiness: demo docs/resources present, gates & wording intact
npm run typecheck
npm run build
```

Local persistence:

* Demo records are stored in `.insighted-data/db.json`.
* Uploaded files are stored in `.insighted-data/uploads`.
* These folders are ignored by git and intended for controlled demos, not production hosting.

## What To Try

1. Sign in as Amelia Stone. She is a Teaching Assistant and is explicitly marked Braille-literate for the demo, so she can upload, edit, and specialist-verify Braille work.
2. Create a Braille Work Review, upload a PNG/JPG/PDF, and run transcription.
3. Review the AI draft, add specialist transcription notes, and specialist-verify the English transcription.
4. Sign in as David Okafor. He is a subject teacher, so he can generate and approve subject feedback from the specialist-verified English transcription, but he is not the default Braille accuracy verifier.
5. Create an Assessment-Safe visual task. Add the prompt and what is being assessed, review answer-sensitive risks, select a hint tier, redact as needed, and approve.
6. Open Audit Trail as Priya, Helen, or Marcus to inspect the recorded actions.
7. Open Admin and run secure deletion for expired uploaded material.

## Features

| Area | What it does |
| --- | --- |
| Auth + RBAC | Demo login with a production-mode off switch; permissions enforced in server actions and UI |
| Braille Work Review | Upload, AI draft transcription, specialist verification, teacher subject feedback, approval, export |
| Feedback Reports | Separates specialist transcription notes from subject teacher feedback and learner-facing summary |
| Assessment-Safe Visual Support | Prompt, assessed skill, hint tiers, answer-sensitive flags, redaction, approval gate, export |
| STEM Description Support | Structured descriptions by visual type with review and approval |
| Pupil Records | Anonymised pupil-linked work across modules |
| Approvals | Cross-module queue for specialist review and teacher approval |
| Audit Trail | Records create, upload, draft, edit, specialist verify, feedback, approve, export, delete, role, retention events, and per-task timelines |
| OCR Quality | Captures correction pairs and supports labelled evaluation samples |
| Admin + Security | Role management, retention setting, local secure deletion, privacy and DPIA placeholders |
| Export | Plain text download and print/PDF view, gated by approval state |

Core product rule: Braille accuracy verification is separate from subject teacher content feedback.

## Demo Accounts

| Name | Role | Demo responsibility |
| --- | --- | --- |
| Amelia Stone | Teaching Assistant | Upload/edit work; Braille-literate specialist verification in demo |
| David Okafor | Teacher | Subject feedback and teacher approval |
| Priya Sharma | QTVI | Specialist verification, accessibility approval, audit |
| Helen Wright | SENCO | Oversight, audit, export, archive |
| Marcus Bell | Admin | Users, settings, audit, retention/deletion |

## Demo Validation & Client Walkthrough

A structured process for confirming every core feature works end-to-end and for presenting the app to a school/client audience — all in safe demo mode.

> **Demo resources must be synthetic, anonymised, or permission-cleared. Do not use identifiable pupil data or live assessment materials without school approval.**

### Run demo mode

```bash
npm install
npm run reset:demo   # clean, deterministic seed data
npm run dev          # http://localhost:3000
```

Demo mode is the default (`AI_MODE=mock`, `DEMO_MODE=true`): AI/OCR drafts are offline and deterministic, so a rehearsed walkthrough is stable. No API keys are required.

### Which staff accounts to use

Sign in from the "Select Workspace Profile" front page; each card enters that role's workspace.

| Account | Role | Use it to show |
| --- | --- | --- |
| Amelia Stone | Teaching Assistant (Braille-literate) | Upload work, run AI/OCR, and (as Braille-literate) specialist-verify |
| David Okafor | Teacher | Subject feedback + approval; that a teacher **cannot** verify Braille accuracy |
| Priya Sharma | QTVI | Specialist Braille verification and accessibility approval |
| Helen Wright | SENCO | Oversight, audit, export, archive |
| Marcus Bell | Admin | Users, settings, audit, retention/secure deletion |

### Which features to test

Braille Work Review · AI/OCR draft transcription · specialist verification · teacher feedback · Assessment-Safe visual description · STEM description support · quality evaluation (CER/WER) · audit trail · admin controls · retention/deletion · export approval gates. Each has explicit steps and expected results in the test matrix.

### Where demo resources go

Place synthetic upload files in [`demo-resources/`](demo-resources/README.md) (`braille/`, `visuals/`, `stem/`, `quality/`, `exports/`). The files themselves are **not** committed — a `.gitignore` there keeps only the structure and docs.

### How to use the demo test matrix

Work through [`docs/demo-test-matrix.md`](docs/demo-test-matrix.md) group by group, recording Pass/Fail. It names the exact role, input, steps, and expected result for every feature (including the export/verification gates and the audit checks).

### How to use the client demo script

Follow [`docs/client-demo-script.md`](docs/client-demo-script.md) — a 10–15 minute, role-by-role walkthrough written for school leaders, SENCOs, QTVIs, and assistive-technology stakeholders. Before presenting, run the [`docs/demo-readiness-checklist.md`](docs/demo-readiness-checklist.md) and the validation commands (`typecheck`, `build`, `validate:mvp`, `validate:ai`, `validate:demo`).

Positioning to hold throughout: **InsightEd AI does not replace QTVIs, Braille-literate staff, or teachers. It creates AI/OCR drafts that are reviewed, corrected, approved, and audited by the right staff roles.**

### Known demo limitations

- AI/OCR output is always a **draft**; mock mode is offline/deterministic and is not a substitute for specialist verification.
- OpenAI vision is **not** a definitive Braille OCR engine — its Braille output is a non-specialist draft requiring QTVI/Braille-literate verification.
- PDF uploads are stored but not rasterised for OCR in this build (upload a PNG/JPG page for OCR).
- Sign-in, storage, and hosting are demo-grade; production needs school identity, secure storage, and durable hosting (not started yet).

## Tech

Next.js 14.2.35 App Router, TypeScript, React Server Components, Server Actions, Tailwind CSS, local file-backed demo persistence.

The app avoids build-time Google font fetching so local and CI builds work without external font network access.

## Project Structure

```text
src/
  app/
    login/
    (app)/
      dashboard/
      braille/
      assessment/
      stem/
      pupils/
      approvals/
      quality/
      audit/
      admin/
  components/
  lib/
    ai/               provider-based AI/OCR service layer
      index.ts        public API: transcribeBraille / describeVisual / describeStemVisual
      config.ts       env-driven config (mock/real, models, upload limits)
      types.ts        provider contract + uncertainty/metadata types
      preprocessing.ts sharp image normalisation
      prompts.ts      prompt text + version strings
      confidence.ts   confidence scoring
      uncertainty.ts  uncertainty-flag helpers + mappers
      safety.ts       error-scrubbing + assessment-context checks
      providers/      mock / openai-vision / external-braille / braille-translation
    store.ts          local demo persistence and seed data
    session.ts        auth boundary and DEMO_MODE switch
    rbac.ts           roles and permissions
    braille-engine.ts legacy mock data (visual-type labels/structures)
    feedback.ts       feedback draft heuristics
    export-content.ts export document builder
```

## Scaling Path

Replace `store.ts` with Supabase/Postgres plus Row Level Security, replace local upload storage with Supabase Storage or Vercel Blob, and replace `session.ts` internals with Supabase Auth or OIDC. The AI/OCR layer is already provider-based under `src/lib/ai/` — add a specialist Braille OCR engine behind the external adapter and a Liblouis binding behind the back-translation interface without touching product logic. Keep the workflow, RBAC, audit, and approval model.

## Current Limitations

* AI/OCR output is always a draft. Mock mode is offline/deterministic; real mode calls the configured provider. Neither is a substitute for specialist verification.
* OpenAI vision is **not** a definitive Braille OCR engine. Its Braille output is a non-specialist draft only and must be verified by a QTVI or Braille-literate specialist.
* True specialist Braille OCR requires an external engine (via the `external_braille_ocr` adapter) or a dedicated dot/cell-detection pipeline; none is bundled.
* Liblouis back-translation is optional and stubbed — it runs after cell detection, not on images, and is not required for the build.
* PDF uploads are stored but not rasterised for OCR in this build; they return a high-severity `pdf_processing_pending` flag. Upload a PNG/JPG page image for OCR.
* Local file persistence is suitable for demos, not serverless production durability.
* `DEMO_MODE=false` disables the staff picker but still needs a real auth provider implementation.
* npm audit on 30 June 2026 still recommends a breaking Next 16 migration for remaining advisories; this branch conservatively patches the app to Next 14.2.35.
