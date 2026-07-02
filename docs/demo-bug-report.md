# Demo Bug Report

Issues found while executing the [demo test matrix](demo-test-matrix.md) end-to-end in demo mode (`AI_MODE=mock`, `DEMO_MODE=true`) on **2026-07-02**, driving the running app as each staff role. Every issue below was reproduced in the app, not just read in code.

**Summary:** 3 issues found, 3 fixed, 0 remaining Priority-0 blockers. All safety-critical controls (specialist Braille verification, export approval gates, role permissions, audit trail, no-secrets-in-audit) passed on first test.

---

## BUG-01 — Braille draft/feedback text not visible until page reload

| Field | Detail |
| --- | --- |
| **Bug ID** | BUG-01 |
| **Feature** | Braille Work Review (draft transcription + teacher feedback) |
| **Severity** | Priority 1 (demo risk — looks like the AI produced nothing) |
| **Status** | ✅ Fixed |
| **Description** | After clicking **Run transcription**, the AI provenance strip and "AI/OCR draft" warning appeared, but the editable "English transcription" textarea stayed empty. Same for the feedback comments/learner-summary fields after **Generate feedback**. The draft only appeared after a manual full-page reload. |
| **Steps to reproduce** | 1. Sign in as Amelia (TA). 2. Create a Braille task. 3. Click **Run transcription**. 4. Observe the transcription textarea. |
| **Expected result** | The generated draft text appears in the editable box immediately, ready to review/verify. |
| **Actual result** | Textarea empty; **Specialist verify** button disabled (because it keys off the empty field) until a manual reload. |
| **Root cause** | The client component seeded its editable state with `useState(t?.editedText ?? "")`. On first mount there was no transcription, so the state initialised to `""`. The server action + `revalidatePath` re-render does not remount the component, so the `useState` initializer never re-ran and the field stayed empty. |
| **Fix applied** | Applied the same fallback idiom the visual/STEM workflows already use: the textarea value falls back to the latest server value when local state is empty (`text \|\| t?.editedText`), and local state is reset (`setText("")`) after Run/Re-run and after Generate feedback so a freshly generated draft (or re-run) is shown without a reload. Save/verify calls use the same effective value. File: `src/app/(app)/braille/[id]/review-workflow.tsx`. |
| **Remaining risk** | None. Re-verified in the app: draft and feedback now appear immediately; Specialist verify enables correctly. |

## BUG-02 — Quality page did not display the OCR prediction

| Field | Detail |
| --- | --- |
| **Bug ID** | BUG-02 |
| **Feature** | Quality / evaluation |
| **Severity** | Priority 1 (clarity — matrix step QA-03) |
| **Status** | ✅ Fixed |
| **Description** | Each evaluation sample stored a `prediction` (the engine's OCR output) but the Quality page only showed CER/WER/accuracy — never the predicted text — so a client could not see *what* the OCR got wrong, which is the whole point of measuring correction burden. |
| **Steps to reproduce** | 1. Sign in as Marcus (Admin). 2. Quality → add a sample with an image + ground-truth text. 3. **Run evaluation**. 4. Inspect the sample row. |
| **Expected result** | The sample shows the ground-truth text and the AI/OCR prediction side by side, plus any flags. |
| **Actual result** | Only CER/WER/accuracy were shown; prediction and per-sample flags were hidden. |
| **Fix applied** | The sample row now shows **Ground truth**, **AI/OCR prediction**, and a per-sample **Flags** summary. File: `src/app/(app)/quality/page.tsx`. |
| **Remaining risk** | None. |

## BUG-03 — Admin panel did not show Braille-literate status

| Field | Detail |
| --- | --- |
| **Bug ID** | BUG-03 |
| **Feature** | Admin controls |
| **Severity** | Priority 1 (clarity/safety messaging — matrix step AD-03) |
| **Status** | ✅ Fixed |
| **Description** | The admin staff list showed name, email, and role, but not whether a staff member is explicitly Braille-literate. This is the exact attribute that lets a Teaching Assistant (Amelia) verify Braille accuracy, so it must be visible to reinforce the core rule. |
| **Steps to reproduce** | 1. Sign in as Marcus (Admin). 2. Open Admin. 3. Look at Amelia Stone's row. |
| **Expected result** | A visible "Braille-literate" indicator on qualifying staff. |
| **Actual result** | No such indicator. |
| **Fix applied** | Added a "Braille-literate" badge (with an explanatory tooltip) next to qualifying staff names. File: `src/app/(app)/admin/page.tsx`. |
| **Remaining risk** | None. |

---

## Controls verified with no defect

These were tested and passed on first attempt — recorded here as positive evidence for the client demo:

- **Teacher cannot verify Braille accuracy.** Signed in as David (Teacher): no Specialist verify control; server action `verifyTranscription` also refuses the teacher role. ✅
- **Teacher feedback blocked before specialist verification.** Feedback UI does not appear pre-verification; `createFeedback` refuses ("Specialist verification is required before teacher feedback"). ✅
- **Export approval gates.** `/api/export/:id` returned **409** before verification/approval and **200** after, for transcription, feedback, visual, and STEM. ✅
- **Audit trail completeness + no secrets.** Every create/upload/AI-run/edit/verify/feedback/approve/export/eval/delete action appeared with actor, role, provider metadata; no API keys, base64 image data, or raw provider responses were exposed. ✅
- **Retention / secure deletion.** Ran secure deletion as Admin; a `data.delete` event was written to the audit trail. ✅
