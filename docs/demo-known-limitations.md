# Demo Known Limitations

An honest, client-safe summary of what this build does **not** yet do, so a demo sets accurate expectations. None of these blocks a demo in mock mode; they define the boundary between the current MVP and a production deployment.

> **Core message:** Braivanta does not replace QTVIs, Braille-literate staff, or teachers. It produces AI/OCR drafts that are reviewed, corrected, approved, and audited by the right staff roles.

> **Data safety warning**
>
> Demo resources must be synthetic, anonymised, or permission-cleared. Do not use identifiable pupil data or live assessment materials without school approval.

## AI / OCR

- **OpenAI Braille output is a draft only.** In real mode the OpenAI vision Braille output is explicitly a *non-specialist draft* and **always requires specialist verification** (by a QTVI, Admin, or Braille-literate staff member) before it is used for teacher feedback or export. It is **not** a definitive Braille OCR engine.
- **ABC Braille integration is provisional.** Run transcription can use ABC Braille's public image-to-text web workflow, but ABC does not publish a supported JSON API or numeric confidence score. The integration may need maintenance if its HTML workflow changes, and production use requires ABC's permission plus school privacy/data-processing approval.
- **Hybrid review is evidence, not verification.** `abc_openai_review` keeps ABC as the primary draft and uses OpenAI only to report structured discrepancies. Vision models can miss small dots, rotation, spatial order, and ambiguous cells, so suggestions are never auto-applied and do not remove the specialist-verification gate.
- **Liblouis is an optional runtime dependency.** A pinned, checksum-verified Windows installer is included for the local demo, but Linux/serverless deployment must provide a compatible runtime separately. It runs *after* cell detection to convert detected Braille into print text — it does not read a photograph on its own — and is never required for install/typecheck/build.
- **PDF upload is accepted but not OCR-rasterised.** PDFs are stored, but full PDF page rasterisation for OCR is pending; a PDF returns a high-severity `pdf_processing_pending` flag. **For an OCR demo, upload a PNG/JPG page image.**
- **Mock mode is illustrative.** Mock drafts and Quality numbers are deterministic and offline — they demonstrate the workflow, not real OCR accuracy. Real accuracy requires `AI_MODE=real` with a configured provider.

## Data, auth & storage (production work, not started in this phase)

- **Demo persistence, not production infrastructure.** Records live in a local demo store (`.insighted-data/`), which falls back to in-memory when the disk is read-only. This is for controlled demos, not durable production hosting.
- **Demo authentication only.** `DEMO_MODE=true` uses a staff picker. Real authentication (identity provider / SSO) is not implemented yet; `DEMO_MODE=false` disables the picker but still needs a real provider wired in.
- **No production database, object storage, or hosted auth yet.** Clerk/Neon/Supabase/Vercel Blob and similar are intentionally out of scope for this phase.

## Data safety & approval status

- **Demo resources must be synthetic, anonymised, or permission-cleared.** Do not use identifiable pupil data, real pupil names, real school assessment materials, or sensitive school records.
- **Not yet approved for live use.** The app is **not** approved for live pupil data or live assessment workflows until data-protection, safeguarding, authentication, storage, and specialist-verification arrangements are approved by the school.

## What is solid in this build (for balance)

- Role-based access control, specialist Braille verification separated from subject-teacher feedback, export approval gates, a complete audit trail with AI provenance and **no secrets exposed**, retention setting + secure deletion, and the provider-based AI/OCR architecture (mock + real, configurable) all work end-to-end in demo mode.
