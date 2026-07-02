# Demo Readiness Checklist

Run this checklist immediately before a client walkthrough. The app is presentation-ready only when every item is ticked.

> **Data safety warning**
>
> Demo resources must be synthetic, anonymised, or permission-cleared. Do not use identifiable pupil data or live assessment materials without school approval.

> **Last full validation: 2026-07-02** — all items below verified end-to-end in demo mode. See [demo-test-matrix.md](./demo-test-matrix.md) (49/49 pass) and [demo-bug-report.md](./demo-bug-report.md) (3 issues found and fixed). Re-run this checklist after any code change.

## Environment

- [x] **App runs locally** — `npm install`, `npm run reset:demo`, `npm run dev`; <http://localhost:3000> loads.
- [x] **Demo mode works** — `AI_MODE=mock` and `DEMO_MODE=true`; drafts are offline and deterministic.
- [x] **All demo accounts tested** — Amelia (TA), David (Teacher), Priya (QTVI), Helen (SENCO), Marcus (Admin) each sign in and land in their workspace.
- [x] **All demo resources checked** — synthetic images available under [`demo-resources/`](../demo-resources/README.md); none committed; each is synthetic/anonymised/permission-cleared.

## Core features (see the [demo test matrix](./demo-test-matrix.md) for exact steps)

- [x] **Braille workflow tested** — task created; upload works; AI/OCR draft produced with provider metadata + uncertainty flags; draft appears immediately (BR-01…BR-06).
- [x] **Specialist verification tested** — teacher blocked; QTVI/Admin/Braille-literate TA can verify (BR-07, BR-08).
- [x] **Teacher feedback workflow tested** — blocked before verification; generate/edit/approve after (TF-01…TF-05).
- [x] **Assessment-Safe workflow tested** — prompt/skill drive answer-sensitive flags; redaction works; approval gate holds (VD-01…VD-09).
- [x] **STEM workflow tested** — structured description, re-style, approve, export (ST-01…ST-08).
- [x] **Quality workflow tested** — ground truth vs AI/OCR prediction, CER/WER, provider/model/confidence, flag summary (QA-01…QA-06).
- [x] **Audit trail tested** — every action recorded with actor, role, and AI provenance; no secrets exposed (AU-01…AU-05).
- [x] **Export gates tested** — export blocked (409) until specialist verification (Braille) / approval (feedback, visual, STEM); allowed (200) after.
- [x] **Admin/retention tested** — staff roles + Braille-literate status visible; secure deletion runs; both audited (AD-01…AD-05).

## Safety & documentation

- [x] **No identifiable pupil data present** — seed data uses synthetic pupils and anonymised reference codes only; `demo-resources/` files are synthetic/anonymised/permission-cleared and not committed.
- [x] **Known limitations documented** — see [demo-known-limitations.md](./demo-known-limitations.md) and the README "Current Limitations".
- [x] **Client script matches app flow** — [client-demo-script.md](./client-demo-script.md) walked through against the working app on 2026-07-02.
- [x] **README updated** — includes the "Demo Validation & Client Showcase" section and the data safety warning.

## Automated pre-flight

Run and confirm all pass:

```bash
npm run typecheck
npm run build
npm run validate:mvp
npm run validate:ai
npm run validate:demo
```

- [x] `typecheck` passes.
- [x] `build` passes.
- [x] `validate:mvp` passes (workflow/RBAC + AI/OCR presence, no old mock calls).
- [x] `validate:ai` passes (AI/OCR behavioural guarantees).
- [x] `validate:demo` passes (demo docs + resources present, gates and wording intact).

## Known demo limitations to state to the client

Full detail in [demo-known-limitations.md](./demo-known-limitations.md). In brief:

- AI/OCR output is always a **draft**; mock mode is offline/deterministic.
- OpenAI vision is **not** a definitive Braille OCR engine — its Braille output is a non-specialist draft requiring specialist verification.
- PDF uploads are stored but not rasterised for OCR in this build (upload a PNG/JPG page for OCR).
- Sign-in, storage, and hosting are demo-grade; production needs school identity, secure storage, and durable hosting.
