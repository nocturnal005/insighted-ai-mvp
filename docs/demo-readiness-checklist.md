# Demo Readiness Checklist

Run this checklist immediately before a client walkthrough. The app is presentation-ready only when every item is ticked.

> **Data safety warning**
>
> Demo resources must be synthetic, anonymised, or permission-cleared. Do not use identifiable pupil data or live assessment materials without school approval.

## Environment

- [ ] **App runs locally** — `npm install`, `npm run reset:demo`, `npm run dev`; <http://localhost:3000> loads.
- [ ] **Demo mode works** — `AI_MODE=mock` and `DEMO_MODE=true`; drafts are offline and deterministic.
- [ ] **All demo accounts work** — Amelia (TA), David (Teacher), Priya (QTVI), Helen (SENCO), Marcus (Admin) each sign in and land in their workspace.

## Core features (see the [demo test matrix](./demo-test-matrix.md) for exact steps)

- [ ] **Braille task can be created** (BR-01).
- [ ] **Upload works** — image/PDF accepted; oversized/unsupported files rejected (BR-02).
- [ ] **AI/OCR draft works** — transcription produced with provider metadata + uncertainty flags (BR-03…BR-06).
- [ ] **Specialist verification works** — teacher blocked; QTVI/Admin/Braille-literate TA can verify (BR-07, BR-08).
- [ ] **Teacher feedback works** — blocked before verification; generate/edit/approve after (TF-01…TF-05).
- [ ] **Assessment-safe task works** — prompt/skill drive answer-sensitive flags; redaction works (VD-01…VD-09).
- [ ] **STEM task works** — structured description, re-style, approve, export (ST-01…ST-08).
- [ ] **Quality evaluation works** — prediction, CER/WER, provider/model/confidence, flag summary (QA-01…QA-06).
- [ ] **Audit trail works** — every action recorded with actor, role, and AI provenance (AU-01…AU-05).
- [ ] **Export gates work** — export blocked until specialist verification (Braille) / approval (feedback, visual, STEM).
- [ ] **Admin retention/deletion works** — retention set; secure deletion runs; both audited (AD-01…AD-05).

## Safety & documentation

- [ ] **No identifiable pupil data present** — seed data uses synthetic pupils and anonymised reference codes only; `demo-resources/` files are synthetic/anonymised/permission-cleared and not committed.
- [ ] **README updated** — includes the Demo Validation & Client Walkthrough section and the data safety warning.
- [ ] **Known limitations documented** — see the README "Current Limitations" and the demo script closing.

## Automated pre-flight

Run and confirm all pass:

```bash
npm run typecheck
npm run build
npm run validate:mvp
npm run validate:ai
npm run validate:demo
```

- [ ] `typecheck` passes.
- [ ] `build` passes.
- [ ] `validate:mvp` passes (workflow/RBAC + AI/OCR presence, no old mock calls).
- [ ] `validate:ai` passes (AI/OCR behavioural guarantees).
- [ ] `validate:demo` passes (demo docs + resources present, gates and wording intact).

## Known demo limitations to state to the client

- AI/OCR output is always a **draft**; mock mode is offline/deterministic.
- OpenAI vision is **not** a definitive Braille OCR engine — its Braille output is a non-specialist draft requiring specialist verification.
- PDF uploads are stored but not rasterised for OCR in this build (upload a PNG/JPG page for OCR).
- Sign-in, storage, and hosting are demo-grade; production needs school identity, secure storage, and durable hosting.
