# Demo Test Matrix

A structured, end-to-end checklist for validating every core InsightEd AI feature in **demo mode** before a client walkthrough. Work through each group in order and record Pass/Fail.

> **Data safety warning**
>
> Demo resources must be synthetic, anonymised, or permission-cleared. Do not use identifiable pupil data or live assessment materials without school approval.

## Before you start

- Run in demo mode: defaults are `AI_MODE=mock` and `DEMO_MODE=true`. Mock mode is deterministic and offline, so drafts are stable for a rehearsed run.
- Start clean: `npm run reset:demo` then `npm run dev`, and open <http://localhost:3000>.
- Place any synthetic upload files in [`demo-resources/`](../demo-resources/README.md).
- Switch staff accounts from the front page ("Select Workspace Profile") — each card signs you in as that role. Sign out from the app header to change role.

## Demo accounts and what each can do

| Account | Role | Key demo capabilities |
| --- | --- | --- |
| Amelia Stone | Teaching Assistant (Braille-literate) | Create tasks, upload, edit drafts, **and specialist-verify Braille** (she is explicitly Braille-literate). Cannot export. |
| David Okafor | Teacher | Generate/edit/approve subject feedback; approve visual/STEM; export. **Cannot specialist-verify Braille accuracy.** |
| Priya Sharma | QTVI | Specialist Braille verification, approvals, export, audit. |
| Helen Wright | SENCO | Oversight, audit, export, archive. |
| Marcus Bell | Admin | Users, settings, audit, retention/secure deletion. |

**Core rule under test:** only a QTVI, Admin, or explicitly Braille-literate staff member can verify Braille accuracy. Ordinary teachers cannot.

Legend for the Pass/Fail column: ☐ = not run, ✅ = pass, ❌ = fail.

---

## Group 1 — Braille Work Review

| Test ID | Feature | Role to use | Input / resource | Steps | Expected result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BR-01 | Create Braille task | Teaching Assistant (Amelia) | — | Braille Work Review → New; enter title/subject, optionally link a synthetic pupil | Task created; opens task page; status `Draft` / `Ready for transcription` | ☐ | |
| BR-02 | Upload Braille work | Teaching Assistant (Amelia) | `demo-resources/braille/*.png` or `.jpg` | Attach an image on the new-task form (or re-upload) | Source image shows in the task; upload recorded in audit (`upload.create`) | ☐ | Oversized/unsupported files are rejected before upload. |
| BR-03 | Run AI/OCR transcription | Teaching Assistant (Amelia) | Uploaded image | Click **Run transcription** | A draft English transcription is produced; audit records `ai.braille_ocr.run` | ☐ | Mock is deterministic. |
| BR-04 | Draft text appears | Teaching Assistant (Amelia) | — | Read the "English transcription" box | Editable draft text is shown, labelled as an AI/OCR draft | ☐ | |
| BR-05 | Provider metadata appears | Teaching Assistant (Amelia) | — | Look at the AI meta strip above the draft | Shows mode (Mock demo), provider, model, confidence %, processing time, prompt version | ☐ | |
| BR-06 | Uncertainty flags appear | Teaching Assistant (Amelia) | — | Look for low-confidence chips / flag count | Low-confidence regions and/or a flag count are shown | ☐ | Seeded `bt_1002` demonstrates flags if no image handy. |
| BR-07 | Teacher cannot specialist-verify | Teacher (David) | Draft task | Sign in as David, open the task | No "Specialist verify" action; message that a QTVI/Admin/Braille-literate staff member must verify | ☐ | Enforced in `verifyTranscription` + RBAC. |
| BR-08 | Specialist can verify | QTVI (Priya) *or* Braille-literate TA (Amelia) | Draft task | Add specialist notes → **Specialist verify** | Status becomes `Specialist verified` / locked; audit `transcription.specialist_verify`; a correction pair is captured for Quality | ☐ | Admin (Marcus) also qualifies. |
| BR-09 | Export blocked before verification | Teacher/QTVI (David or Priya) | A task **not yet** verified | Attempt to export the transcription (`/api/export/<id>?kind=transcription`) | Blocked with 409 "Transcription must be specialist verified before export" | ☐ | Export button only appears post-verify in the UI. |
| BR-10 | Export allowed after verification | QTVI (Priya) | Verified task | Use **Export transcription** | Plain-text download succeeds; audit records the export | ☐ | TA cannot export (no `export` permission). |

## Group 2 — Teacher subject feedback

| Test ID | Feature | Role to use | Input / resource | Steps | Expected result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TF-01 | Feedback blocked before verification | Teacher (David) | Task with an **unverified** transcription | Attempt to generate feedback | Blocked: "Specialist verification is required before teacher feedback" | ☐ | Enforced in `createFeedback`. |
| TF-02 | Specialist-verify the transcription | QTVI (Priya) | Draft task | Specialist verify (as BR-08) | Transcription becomes verified/locked | ☐ | Prerequisite for feedback. |
| TF-03 | Generate subject feedback | Teacher (David) | Verified task | **Generate feedback** | Draft feedback report appears; audit `feedback.generate`; banner clarifies it does **not** verify Braille accuracy | ☐ | |
| TF-04 | Edit teacher comments | Teacher (David) | Feedback draft | Edit "Subject teacher feedback" + learner summary → **Save changes** | Edits saved; audit `feedback.edit` | ☐ | |
| TF-05 | Approve feedback | Teacher (David) or QTVI (Priya) | Feedback draft | **Approve report** | Status `Approved`/locked; audit `feedback.approve` | ☐ | |
| TF-06 | Export only after approval | Teacher/QTVI | Feedback | Export before approval → blocked ("must be teacher approved"); export after approval → succeeds | Gate enforced both ways | ☐ | `kind=feedback`. |

## Group 3 — Assessment-Safe visual description

| Test ID | Feature | Role to use | Input / resource | Steps | Expected result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| VD-01 | Create visual task | Teaching Assistant (Amelia) or Teacher (David) | `demo-resources/visuals/*.png` | Assessment-Safe → New; set title, **context = assessment/class test** | Task created; description auto-generated from the image + context | ☐ | |
| VD-02 | Upload chart/diagram/image | (same) | Visual image | Attach on the new-task form | Source visual shown | ☐ | |
| VD-03 | Add question prompt | (same) | — | Fill "Question prompt" (Assessment context card) | Prompt saved; drives answer-safety checks | ☐ | |
| VD-04 | Add assessed skill | (same) | — | Fill "Assessed skill" → **Save context & regenerate** | Skill saved; description regenerated against new context | ☐ | Missing prompt/skill in assessment context raises a red safety warning. |
| VD-05 | Generate description | (same) | — | (Auto on create, or regenerate) | Neutral description produced; audit `ai.visual_description.run`; provider metadata shown | ☐ | |
| VD-06 | Answer-sensitive flags appear | (same) | — | Review "Answer-sensitive areas" | Flags list phrases that may hint at the answer | ☐ | |
| VD-07 | Redaction works | Teacher/QTVI/Braille-literate TA (edit rights) | — | Click **Redact** on a flag | Flagged phrase replaced with `[redacted]` in the editable text | ☐ | |
| VD-08 | Export blocked before approval | Teacher/QTVI | Unapproved task | Attempt export (`kind=visual`) | Blocked: "Description must be approved before export" | ☐ | Assessment banner states the same. |
| VD-09 | Approve and export | Teacher (David) or QTVI (Priya) | — | **Approve for use**, then **Export description** | Status `Approved`/locked; export succeeds; audit `visual.approve` then export | ☐ | |

## Group 4 — STEM description support

| Test ID | Feature | Role to use | Input / resource | Steps | Expected result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ST-01 | Create STEM task | Teaching Assistant/Teacher | `demo-resources/stem/*.png` | STEM Support → New; set title + visual type | Task created; suggested structure shown for the visual type | ☐ | |
| ST-02 | Upload graph/table/diagram | (same) | STEM image | Attach on the new-task form | Source visual shown | ☐ | |
| ST-03 | Select visual type | (same) | — | Choose graph/table/labelled diagram/etc. | Structure suggestions match the type | ☐ | |
| ST-04 | Generate structured description | (same) | — | (Auto on create) | Structured description produced; audit `ai.stem_description.run` | ☐ | |
| ST-05 | Re-style description | Teacher/QTVI/edit rights | — | Switch style (Descriptive / Instructional / Assessment-safe) | Text re-drafts to the chosen style; audit `stem.restyle` | ☐ | |
| ST-06 | AI metadata appears | (same) | — | Look at the AI meta strip | Mode/provider/model/confidence/processing time/prompt version shown | ☐ | |
| ST-07 | Approve | Teacher (David) or QTVI (Priya) | — | **Approve & save to record** | Status `Approved`/locked; audit `stem.approve` | ☐ | |
| ST-08 | Export | Teacher/QTVI/SENCO/Admin | Approved task | **Export description** (`kind=stem`) | Export succeeds; blocked if not approved | ☐ | |

## Group 5 — Quality / evaluation

Quality actions require the **audit.read** permission — use QTVI (Priya), SENCO (Helen), or Admin (Marcus).

| Test ID | Feature | Role to use | Input / resource | Steps | Expected result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QA-01 | Add evaluation sample | QTVI/SENCO/Admin | `demo-resources/quality/*.png` + known correct text | Quality → New sample; add label, ground-truth text, optional image, governance fields | Sample stored; audit `eval.sample` | ☐ | Set sample source + permission status honestly. |
| QA-02 | Run evaluation | QTVI/SENCO/Admin | — | **Run evaluation** | Every sample scored; audit `eval.run` | ☐ | |
| QA-03 | Prediction appears | (same) | — | Inspect the sample | The engine's predicted transcription is shown | ☐ | |
| QA-04 | CER / WER appear | (same) | — | Inspect the sample | Character- and word-error rates are shown | ☐ | |
| QA-05 | Provider / model / confidence appear | (same) | — | Inspect the sample | Image samples show provider/model/confidence; text-only samples labelled `mock` | ☐ | Text-only samples use mock simulation on purpose. |
| QA-06 | Flag summary appears | (same) | — | Inspect the sample + aggregate metrics | Per-sample flag summary and aggregate metrics (avg CER/WER/confidence, counts, top flags) shown | ☐ | |

## Group 6 — Audit trail

Audit is visible to QTVI (Priya), SENCO (Helen), Admin (Marcus).

| Test ID | Feature | Role to use | Input / resource | Steps | Expected result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AU-01 | Create → upload → run | TA (Amelia) | Braille image | Create task, upload, run OCR | Actions occur | ☐ | |
| AU-02 | Edit output | TA/specialist | — | Edit the draft, save | Edit recorded | ☐ | |
| AU-03 | Verify / approve | QTVI (Priya) / Teacher (David) | — | Specialist verify, then approve feedback | Status changes recorded | ☐ | |
| AU-04 | Export | QTVI/Teacher/SENCO/Admin | Approved output | Export | Export recorded | ☐ | |
| AU-05 | Every action appears in Audit | QTVI/SENCO/Admin | — | Open Audit Trail | Each of the above appears with actor, role, action, object, timestamp; AI runs show provider/model/confidence/flag summary | ☐ | Also visible per-task in the timeline. |

## Group 7 — Admin controls & retention/deletion

Admin panel requires **org.manage** — use Admin (Marcus).

| Test ID | Feature | Role to use | Input / resource | Steps | Expected result | Pass/Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AD-01 | Open admin panel | Admin (Marcus) | — | Open Admin | Panel loads; non-admins are refused | ☐ | |
| AD-02 | Staff roles visible | Admin (Marcus) | — | View the staff list | All staff and their roles are listed | ☐ | |
| AD-03 | Braille-literate status visible | Admin (Marcus) | — | Check Amelia's row | Braille-literate status is shown | ☐ | Confirms who may verify Braille. |
| AD-04 | Retention / secure deletion (demo) | Admin (Marcus) | — | Set retention days; run secure deletion of expired material | Expired uploads purged; setting saved | ☐ | Operates on the local demo store only. |
| AD-05 | Deletion / retention events audited | Admin (Marcus) → Audit | — | Open Audit Trail | `settings.retention` and `data.delete` events are recorded | ☐ | |

---

## Result summary

| Group | Total | Passed | Failed | Notes |
| --- | --- | --- | --- | --- |
| 1 — Braille Work Review | 10 | | | |
| 2 — Teacher feedback | 6 | | | |
| 3 — Assessment-Safe visual | 9 | | | |
| 4 — STEM | 8 | | | |
| 5 — Quality | 6 | | | |
| 6 — Audit | 5 | | | |
| 7 — Admin & retention | 5 | | | |

Sign-off: the app is demo-ready when every export/verification gate holds, AI drafts carry provider metadata and uncertainty flags, and every action is audited.
