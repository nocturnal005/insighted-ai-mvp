# Client Demo Script

A 10–15 minute walkthrough for presenting InsightEd AI to school leaders, SENCOs, QTVIs, teaching assistants, subject teachers, and assistive-technology stakeholders. Designed to be delivered by a non-technical presenter running the app in **demo mode**.

> **Data safety warning**
>
> Demo resources must be synthetic, anonymised, or permission-cleared. Do not use identifiable pupil data or live assessment materials without school approval.

**Positioning to keep front of mind throughout:**

> InsightEd AI does not replace QTVIs, Braille-literate staff, or teachers. It creates AI/OCR drafts that are reviewed, corrected, approved, and audited by the right staff roles.

## Before the meeting (2 minutes, off-camera)

- `npm run reset:demo` then `npm run dev`; open <http://localhost:3000>.
- Confirm demo mode (`AI_MODE=mock`, `DEMO_MODE=true`) so every draft is stable and offline.
- Have one synthetic Braille image and one synthetic chart/diagram ready in [`demo-resources/`](../demo-resources/README.md).
- Optionally rehearse with the [demo test matrix](./demo-test-matrix.md) so nothing surprises you live.

Timings below are a guide (≈13 minutes of content).

> **Validated against the working app on 2026-07-02.** Every step below was walked through end-to-end in demo mode (see [demo-test-matrix.md](./demo-test-matrix.md) and [demo-bug-report.md](./demo-bug-report.md)). Known limitations to mention are in [demo-known-limitations.md](./demo-known-limitations.md).

---

### 1. Opening message (1 min)

> "Thank you for your time. InsightEd AI is a secure, human-verified workflow that helps your visual-impairment support team turn Braille work and visual materials into accessible, accurate outputs — faster, and with a full audit trail.
>
> The most important thing to know up front: this tool **does not replace** your QTVIs, your Braille-literate staff, or your teachers. It produces AI and OCR **drafts**. Those drafts are always reviewed, corrected, approved, and audited by the right member of staff before anything is used with a learner. What you'll see today is running in a safe demo mode with synthetic data — no real pupil information."

### 2. Login and staff roles (1.5 min)

- Show the "Select Workspace Profile" landing page.

> "Everyone signs in to a workspace matched to their role. We model five roles, and access is enforced per role at every step:
> - **Teaching Assistant** — uploads and prepares work; may verify Braille **only** if they are explicitly Braille-literate.
> - **Teacher** — writes and approves subject feedback; a teacher is **not** the default person who checks Braille accuracy.
> - **QTVI** — the specialist who verifies Braille accuracy and gives final accessibility approval.
> - **SENCO** — oversight, audit, reporting, and export.
> - **Admin** — user management, settings, audit, and data retention/deletion.
>
> This role separation is deliberate: it keeps specialist judgement with specialists."

- Enter as **Amelia Stone (Teaching Assistant, Braille-literate)**.

### 3. Braille Work Review demo (2.5 min)

- Create a Braille Work Review task; upload the synthetic Braille image; click **Run transcription**.

> "A support assistant uploads a photo of the pupil's Braille work. The system produces a **draft English transcription** using AI/OCR. Notice what it shows alongside the text: the AI mode, the provider and model, a confidence score, and **uncertainty flags** on anything it's unsure about. Crucially, this is clearly marked as a draft — it is explicitly *not* treated as final, and it cannot move forward until a specialist has checked it."

- Point out the low-confidence highlights and the stage tracker (Upload → AI draft → Specialist verify → Teacher feedback → Export).

### 4. Specialist verification demo (2 min)

- Sign out; sign in as **David Okafor (Teacher)**; open the task.

> "Here's the safeguard in action. David is a subject teacher. He **cannot** verify Braille accuracy — the option isn't available to him, and the system explains that a QTVI, Admin, or Braille-literate staff member must do it."

- Sign in as **Priya Sharma (QTVI)**; add specialist notes; click **Specialist verify**.

> "Priya is our QTVI. She reviews the draft, corrects anything the AI got wrong, adds her notes, and verifies it. Only now is the transcription locked as specialist-verified — and that correction is also captured as quality data we can use to measure and improve accuracy over time."

### 5. Teacher feedback demo (2 min)

- As **David Okafor (Teacher)**, generate feedback, edit the comments, then **Approve report**.

> "Now that a specialist has verified the English, the subject teacher can do their job: write subject feedback for the learner. The system drafts it, David edits it in his own words, and approves it. The tool is explicit that this feedback is about subject content — it does **not** re-judge Braille accuracy, which has already been done by the specialist. Only after approval can the report be exported."

### 6. Assessment-Safe visual description demo (2 min)

- As a teacher/TA, create an Assessment-Safe task with **context = assessment**; upload the synthetic chart; add the question prompt and assessed skill.

> "This is for exams and tests. A visually impaired learner needs a description of a graph or diagram — but that description must **not** give away the answer. We tell the system what's being assessed, and it produces a neutral description and **flags any wording that could reveal the answer**. Staff can redact those phrases in one click."

- Redact a flagged phrase; approve; note the export gate.

> "Nothing here can be exported until a teacher or QTVI approves it — the assessment-safety review is mandatory."

### 7. STEM description demo (1.5 min)

- Create a STEM task; upload a science diagram/graph; show the suggested structure; switch style; approve.

> "For science and maths, the system produces a **structured** description suited to the visual type — a graph, a table, a labelled diagram. Staff can switch the style — descriptive, instructional, or assessment-safe — and, as everywhere, it's approved before use."

### 8. Quality / evaluation demo (1.5 min)

- Sign in as **Priya (QTVI)** or **Marcus (Admin)**; open Quality; add a sample with an image and ground-truth text; **Run evaluation**.

> "This is how we prove and track accuracy. We hold out samples where we already know the correct transcription, run the engine, and measure the error rate — character error rate and word error rate — alongside provider, model, confidence, and any flags. Each sample shows the **ground truth next to the AI/OCR prediction**, so you can see exactly what staff would need to correct. This gives the school an evidence base, and it's how a real specialist OCR engine would be validated before wider rollout."

### 9. Audit and admin demo (1.5 min)

- Open **Audit Trail** (as Priya/Helen/Marcus).

> "Everything you've just seen is recorded: who did what, in which role, when — every upload, AI run, edit, verification, approval, and export, with the AI provenance attached. For a school, this is the safeguarding and accountability layer."

- As **Marcus (Admin)**, show the staff list (with Braille-literate status), set retention, and run secure deletion.

> "Admins manage roles and data retention, and can securely delete expired material on demand — and those deletions are themselves audited."

### 10. Closing message and known limitations (1 min)

> "To summarise: InsightEd AI speeds up accessible-materials work while keeping your specialists firmly in control. Every AI output is a draft, Braille accuracy is always specialist-verified, assessment materials are answer-safe, exports are gated on approval, and everything is audited.
>
> To be transparent about today's demo:
> - It runs in **demo mode** with **synthetic data** — it is not for identifiable pupil data or live assessment materials without your data-protection approval.
> - The AI/OCR here produces **drafts only**. OpenAI vision is **not** a definitive Braille OCR engine — its Braille output is a non-specialist draft and always needs specialist verification. A production deployment would add a specialist Braille OCR engine behind the existing adapter.
> - Sign-in, storage, and hosting shown here are demo-grade; production would use school identity, secure storage, and durable hosting.
>
> We'd love to discuss a controlled pilot with your data-protection and safeguarding leads. What questions can I answer?"

---

## Quick role cheat-sheet for the presenter

| Step | Sign in as | Why |
| --- | --- | --- |
| Braille upload + OCR | Amelia (TA, Braille-literate) | Can upload and run OCR |
| Teacher **can't** verify Braille | David (Teacher) | Shows the safeguard |
| Specialist verification | Priya (QTVI) | Verifies Braille accuracy |
| Subject feedback + approval | David (Teacher) | Subject content, not Braille |
| Visual / STEM approval | David (Teacher) or Priya (QTVI) | Approval gate |
| Quality evaluation | Priya (QTVI) / Marcus (Admin) | Needs audit access |
| Audit trail | Priya / Helen / Marcus | Needs audit access |
| Admin + retention/deletion | Marcus (Admin) | Needs org management |
