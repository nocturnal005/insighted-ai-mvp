# Stage 4 dual-assessment capability map

## Implemented boundary

Stage 4 preserves one evidence chain while making two human authority layers explicit:

1. An authorised Braille-literate specialist reviews machine interpretation, records bounded correction evidence, and locks the verified English transcription.
2. An independently authorised teacher/feedback approver assesses subject content from that locked transcription and owns educational feedback.

The existing Stage 1 workspace, Stage 2 review items, Stage 3 provenance/standards records, correction pairs, audit store, export gates, and complete-task JSONB persistence remain in use.

## Specialist correction evidence

`SpecialistCorrectionEvidence` is optional for historical compatibility and append-only for new specialist corrections. It records the existing task/review-item relationship, original machine passage when safely available, previous/current reviewed text, bounded correction category, specialist identity/time/reason, source-evidence availability, and an explicit attribution state.

Whole-document edits are represented without pretending that an exact machine passage mapping exists. Their `machineText` is `null`; the existing transcription `draftText` remains the authoritative original machine output. Confirmed-without-change and needs-re-scan decisions remain review/audit evidence and do not become text-correction records.

Correction categories describe transcription changes only. They do not label learner fault, skill, progress, attainment, or proficiency. Causal attribution defaults to `unknown`; no LLM infers it.

## Teacher subject-content assessment

The existing `FeedbackReport` gains one optional teacher-owned `subjectAssessment` object with strengths, misconceptions/inaccuracies, bounded completeness, reasoning, teacher identity, and time. It contains no numerical score, grade, attainment band, or prediction.

The server refuses feedback creation, feedback editing, structured assessment, and final approval unless the transcription remains specialist-verified. The teacher assessment planner returns a new feedback object only and does not mutate transcription, provenance, standards evaluations, or specialist correction evidence.

## RBAC and evidence access

Specialist actions continue to require `transcription.specialist_verify`. Teacher assessment requires the existing independent `feedback.approve` permission. A Braille-literate teaching assistant can therefore perform specialist review but cannot perform teacher approval. QTVI and admin roles retain teacher approval only because the existing RBAC explicitly grants that permission separately.

Source/provider evidence remains server-redacted for users without specialist evidence permission. Stage 4 correction records do not copy raw provider payloads or provider identity into teacher assessment.

## Persistence and audit

Both optional Stage 4 structures live in the existing complete `BrailleTask` JSONB record and pass through `persistBrailleTask()` / `hydrateBrailleTask()`. No destructive migration or historical backfill is performed. Missing historical evidence renders as `not recorded`; no classification is guessed from final text.

Specialist passage corrections, specialist whole-document corrections, teacher subject assessment, specialist verification, feedback edits, and final approval use distinct audit actions.

## Evidence limits

Controlled tests establish software behaviour only. Stage 4 does not establish learner Braille proficiency, longitudinal progress, mastery, diagnostic need, predicted outcomes, automated grades, real-world effectiveness, specialist time savings, comprehensive standards coverage, compliance certification, production readiness, or product-market fit.
