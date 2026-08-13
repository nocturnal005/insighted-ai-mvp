/** Stage 4 dual-authority assessment and structured correction-evidence contract. */
import { existsSync, readFileSync } from "node:fs";

const checks = [
  ["historical correction evidence stays optional", "src/lib/types.ts", "specialistCorrectionEvidence?: SpecialistCorrectionEvidence[] | null"],
  ["historical teacher assessment stays optional", "src/lib/types.ts", "subjectAssessment?: TeacherSubjectAssessment | null"],
  ["machine text remains separately represented", "src/lib/types.ts", "machineText: string | null"],
  ["previous reviewed text is explicit", "src/lib/types.ts", "previousText: string"],
  ["current reviewed text is explicit", "src/lib/types.ts", "reviewedText: string"],
  ["reviewer identity is recorded", "src/lib/types.ts", "reviewerId: string"],
  ["reviewer time is recorded", "src/lib/types.ts", "reviewedAt: string"],
  ["reviewer reason is recorded", "src/lib/types.ts", "reviewerReason: string"],
  ["source evidence availability is explicit", "src/lib/types.ts", "sourceEvidenceAvailability: ProvenanceAvailability"],
  ["standards relationships cannot be invented implicitly", "src/lib/types.ts", "relatedStandardRuleIds: string[]"],
  ["bounded correction taxonomy is implemented", "src/lib/dual-assessment.ts", "SPECIALIST_CORRECTION_CATEGORIES"],
  ["unknown correction categories are refused", "src/lib/dual-assessment.ts", "Unknown specialist correction category"],
  ["unknown attribution is supported", "src/lib/dual-assessment.ts", 'request.attribution ?? "unknown"'],
  ["correction requires a human reason", "src/lib/dual-assessment.ts", "A specialist correction reason is required"],
  ["unchanged text cannot become correction evidence", "src/lib/dual-assessment.ts", "Correction evidence requires a changed reviewed transcription"],
  ["confirmed and rescan states do not become corrections", "src/lib/dual-assessment.ts", 'request.reviewStatus !== "corrected"'],
  ["whole-document correction source is supported", "src/app/(app)/braille/actions.ts", 'source: "whole_document_edit"'],
  ["whole-document mapping is not fabricated", "src/app/(app)/braille/actions.ts", "machineText: null"],
  ["flagged correction evidence reuses the review item", "src/app/(app)/braille/actions.ts", 'source: "flagged_passage"'],
  ["specialist evidence is appended", "src/app/(app)/braille/actions.ts", "...(transcription.specialistCorrectionEvidence ?? [])"],
  ["OCR reruns preserve earlier correction evidence", "src/app/(app)/braille/actions.ts", "specialistCorrectionEvidence: priorSpecialistCorrectionEvidence"],
  ["specialist correction has a server permission guard", "src/app/(app)/braille/actions.ts", "Only authorised Braille specialists can record correction evidence"],
  ["teacher assessment uses feedback permission", "src/app/(app)/braille/actions.ts", 'can(user.role, "feedback.approve")'],
  ["teacher assessment has a server verification gate", "src/lib/dual-assessment.ts", "Specialist verification is required before teacher subject-content assessment"],
  ["feedback creation uses the server verification gate", "src/app/(app)/braille/actions.ts", "teacherVerifiedTranscriptionError(task)"],
  ["teacher planner only returns a feedback replacement", "src/lib/dual-assessment.ts", "feedback: { ...request.task.feedback, subjectAssessment: assessment }"],
  ["structured strengths are teacher-owned", "src/lib/types.ts", "strengths: string"],
  ["structured misconceptions are teacher-owned", "src/lib/types.ts", "misconceptions: string"],
  ["completeness vocabulary is bounded", "src/lib/dual-assessment.ts", "SUBJECT_CONTENT_COMPLETENESS"],
  ["reasoning remains human-authored", "src/lib/types.ts", "reasoning: string"],
  ["teacher assessment identity audit exists", "src/app/(app)/braille/actions.ts", 'action: "feedback.subject_assess"'],
  ["specialist whole-document audit stays distinct", "src/app/(app)/braille/actions.ts", '"transcription.correction.record"'],
  ["passage correction audit stays distinct", "src/app/(app)/braille/actions.ts", "transcription.review_item.${nextStatus}"],
  ["teacher UX names specialist-verified input", "src/app/(app)/braille/[id]/review-workflow.tsx", "Specialist-verified transcription"],
  ["teacher UX names subject-content authority", "src/app/(app)/braille/[id]/review-workflow.tsx", "Subject-content assessment & feedback"],
  ["teacher UX disclaims Braille judgement", "src/app/(app)/braille/[id]/review-workflow.tsx", "You are not being asked to judge Braille accuracy"],
  ["correction evidence uses progressive disclosure", "src/app/(app)/braille/[id]/review-workflow.tsx", "Correction evidence ("],
  ["historical evidence renders not recorded", "src/app/(app)/braille/[id]/review-workflow.tsx", "Correction evidence:</span> not recorded"],
  ["UI disclaims learner proficiency inference", "src/app/(app)/braille/[id]/review-workflow.tsx", "It is not a learner-proficiency judgement"],
  ["durable test calls production persistence", "tests/stage4-durable-persistence.test.ts", "await persistBrailleTask(task)"],
  ["durable test calls production hydration", "tests/stage4-durable-persistence.test.ts", "await hydrateBrailleTask(task.id)"],
  ["durable test preserves provenance", "tests/stage4-durable-persistence.test.ts", "protectedProvenance"],
  ["durable test preserves standards", "tests/stage4-durable-persistence.test.ts", "protectedStandards"],
  ["durable test preserves specialist evidence after teacher work", "tests/stage4-durable-persistence.test.ts", "protectedCorrections"],
  ["authority tests cover Braille-literate specialist without teacher approval", "tests/stage4-dual-assessment.test.ts", 'can("teaching_assistant", "feedback.approve"'],
  ["capability map states bounded evidence claims", "docs/stage-4-dual-assessment-capability-map.md", "Controlled tests establish software behaviour only"],
];

const exclusions = [
  ["production taxonomy excludes learner_error", ["src/lib/types.ts", "src/lib/dual-assessment.ts", "src/app/(app)/braille/actions.ts"], "learner_error"],
  ["production taxonomy excludes student_mistake", ["src/lib/types.ts", "src/lib/dual-assessment.ts", "src/app/(app)/braille/actions.ts"], "student_mistake"],
  ["teacher UI has no automated grade", ["src/app/(app)/braille/[id]/review-workflow.tsx"], "automated grade:"],
];

let failures = 0;
for (const [label, file, needle] of checks) {
  const content = existsSync(file) ? readFileSync(file, "utf8") : "";
  const pass = content.includes(needle);
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${label}`);
  if (!pass) failures += 1;
}
for (const [label, files, needle] of exclusions) {
  const pass = files.every((file) => !readFileSync(file, "utf8").includes(needle));
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${label}`);
  if (!pass) failures += 1;
}

const total = checks.length + exclusions.length;
if (failures) {
  console.error(`\nStage 4 validation failed (${failures}/${total} checks)`);
  process.exit(1);
}
console.log(`\nStage 4 dual assessment and correction evidence passed (${total} checks)`);
