# InsightEd AI MVP

> Secure, human-verified accessibility workflow for visual impairment education teams.

InsightEd AI is a controlled-demo and pilot-readiness MVP for mainstream secondary school VI support workflows. It keeps demo resources and mock AI services, but the workflow mechanics are functional: role checks, specialist verification, teacher feedback approval, audit logging, exports, local persistence, upload metadata, and retention deletion.

## Run It

```bash
npm install
npm run reset:demo
npm run dev
```

Open http://localhost:3000.

`npm run reset:demo` clears local demo records and uploads so the seeded walkthrough data is recreated on the next app start.

## MVP Mode

This MVP is designed for controlled demonstration and validation. It uses human-in-the-loop review for all AI outputs. It must not be used with identifiable pupil data or live assessment material until proper school approval, safeguarding checks, data protection review, and production security arrangements are completed.

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEMO_MODE` | `true` unless set to `false` | Enables the local staff-picker login. Set `DEMO_MODE=false` before wiring Supabase Auth or another identity provider. |

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
    store.ts          local demo persistence and seed data
    session.ts        auth boundary and DEMO_MODE switch
    rbac.ts           roles and permissions
    braille-engine.ts mock transcription/description engine
    feedback.ts       feedback draft heuristics
    export-content.ts export document builder
```

## Scaling Path

Replace `store.ts` with Supabase/Postgres plus Row Level Security, replace local upload storage with Supabase Storage or Vercel Blob, replace `session.ts` internals with Supabase Auth or OIDC, and replace `braille-engine.ts` with a real OCR/vision provider. Keep the workflow, RBAC, audit, and approval model.

## Current Limitations

* AI services are mock/heuristic and must remain labelled as draft output.
* Local file persistence is suitable for demos, not serverless production durability.
* `DEMO_MODE=false` disables the staff picker but still needs a real auth provider implementation.
* npm audit on 30 June 2026 still recommends a breaking Next 16 migration for remaining advisories; this branch conservatively patches the app to Next 14.2.35.
