# InsightEd AI — MVP

> Secure, human-verified accessibility workflow for visually impaired (VI) education teams.

A **runnable, zero-setup** MVP. No database, no API keys, no cloud account — clone, install, run, and click through the full workflow. The data layer is an in-memory store seeded with realistic demo data; it's deliberately isolated behind simple functions so it can be swapped for Postgres/Supabase later without touching the UI.

## Run it

```bash
npm install
npm run dev
```

Open **http://localhost:3000** and pick a staff account to sign in.

> No `.env` needed. State resets when the server restarts (it's an in-memory demo store).

## What to try (2-minute tour)

1. **Sign in as _Amelia Stone_ (Teaching Assistant)** — notice she can upload and edit, but the **Verify** and **Approve** buttons are gated. That's role-based access.
2. Go to **Braille Work Review → New review**, add a title, attach any image (optional), **Create**.
3. Click **Run transcription** → an AI *draft* appears with a **confidence score** and **low-confidence flags**. Edit the text.
4. Sign out, **sign in as _David Okafor_ (Teacher)** or _Priya Sharma_ (QTVI)**, reopen the task, and **Mark as verified** → it locks as the staff-approved final, then **Generate feedback**.
5. Open **Assessment-Safe** — draft a neutral description of a graph, see **answer-sensitive flags** and **hint tiers (0/1/2)**, then **Approve for use** (teacher/QTVI only).
6. As Priya (QTVI) or Helen (SENCO), open the **Audit Trail** — every action is recorded.

## Features

| Area | What it does |
|---|---|
| **Auth + RBAC** | 5 roles (TA, Teacher, QTVI, SENCO, Admin); permissions enforced in actions **and** UI |
| **Dashboard** | Live task stats (active / awaiting / approved / rejected) + recent activity |
| **Braille Work Review** | Upload → AI draft transcription (confidence + flags) → staff edit → **verify gate** → **editable feedback report** (teacher comments + learner summary) → **approve** → **export** |
| **Assessment-Safe Visual Support** | Neutral descriptions, **hint tiers (0/1/2)**, answer-sensitive flags, **per-flag redaction**, **approval gate**, export |
| **STEM Description Support** | Visual-type classification, type-specific structured templates, Descriptive / Instructional / Assessment-safe styles, answer-reveal flags, approve → save to pupil record → export |
| **Pupil Records** | Anonymised profiles with all linked, approved work across modules |
| **Approvals** | Cross-module queue of everything awaiting review |
| **Audit Trail** | Append-only record of every create/edit/verify/approve/reject/export |
| **OCR Quality** | Auto-captures every (AI draft → verified final) pair as labelled data; evaluation harness scores any engine with **CER/WER** against ground-truth samples |
| **Admin & Security** | User role management, data-retention setting, secure-deletion (stub), Privacy + DPIA placeholder pages |
| **Export** | Plain-text download **and** print/Save-as-PDF view, gated so nothing exports until verified/approved |
| **AI safety** | Nothing is "final" without human verification; AI output always labelled a draft |

Task statuses: Draft → Needs review → Approved / **Rejected** (with reason) / **Archived**.

## Demo accounts

| Name | Role | Can verify / approve? |
|---|---|---|
| Amelia Stone | Teaching Assistant | No (upload + edit + export) |
| David Okafor | Teacher | Yes |
| Priya Sharma | QTVI | Yes (+ audit) |
| Helen Wright | SENCO | No (oversight + audit + export) |
| Marcus Bell | Admin | Yes (+ user/role management) |

## Tech

Next.js 14 (App Router, TypeScript) · React Server Components + Server Actions · Tailwind CSS · in-memory store. Modern minimalist UI tuned for WCAG 2.2 AA (focus rings, semantic landmarks, reduced-motion, keyboard support).

## Project structure

```
src/
  app/
    login/                 # demo sign-in (role picker) + actions
    (app)/                 # authenticated shell
      dashboard/
      braille/             # Module 1: list, new, detail + review workflow, actions
      assessment/          # Assessment-Safe: list, new, detail + workflow, actions
      audit/               # audit trail (SENCO/QTVI/Admin)
      stem/  admin/        # roadmap placeholders
  components/              # ui primitives, nav, page header
  lib/
    store.ts               # in-memory seeded data (the only stateful module)
    session.ts             # cookie session (swap for real auth later)
    rbac.ts                # roles → permissions
    braille-engine.ts      # mock transcription + visual description (swappable)
    feedback.ts            # feedback heuristics
    data.ts  types.ts  utils.ts
```

## Scaling path

This MVP shares its architecture with the production design (see the sibling `insighted-ai` project): swap `store.ts` for Supabase/Postgres with Row-Level Security, `session.ts` for Supabase Auth, and the mock engine for a real vision/OCR provider behind the same interface. The UI, workflow, and RBAC stay unchanged.
