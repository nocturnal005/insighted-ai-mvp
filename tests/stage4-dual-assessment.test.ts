import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SPECIALIST_CORRECTION_CATEGORIES,
  correctionEvidenceState,
  planSpecialistCorrectionEvidence,
  planTeacherSubjectAssessment,
  teacherVerifiedTranscriptionError,
} from "../src/lib/dual-assessment.ts";
import { can } from "../src/lib/rbac.ts";
import type {
  BrailleTask,
  FeedbackReport,
  SpecialistCorrectionEvidence,
  StandardRuleEvaluation,
  TranscriptionProvenance,
} from "../src/lib/types.ts";

const at = "2026-08-13T14:00:00.000Z";

const provenance: TranscriptionProvenance = {
  version: "1",
  availability: "partial",
  provider: "controlled-provider",
  model: "controlled-model",
  engineVersion: null,
  evidenceContract: null,
  pages: [],
  limitations: ["Controlled fixture."],
};

const standardsEvaluations: StandardRuleEvaluation[] = [{
  standardFamily: "UEB",
  ruleId: "UEB-6.1.1",
  ruleVersion: "2024",
  ruleTitle: "Numeric mode",
  sourceReference: "https://iceb.org/",
  automatedOutcome: "insufficient_evidence",
  evaluatedAt: at,
  evidenceSummary: "Controlled fixture.",
  evidenceCellIds: [],
  implementationScope: "Controlled fixture.",
  limitations: [],
  overrides: [],
}];

function feedback(): FeedbackReport {
  return {
    summary: "Draft teacher feedback.",
    findings: { spelling: [], contractions: [], formatting: [], unclear: [] },
    specialistNotes: "Specialist evidence remains separate.",
    subjectFeedback: "",
    teacherComments: "",
    learnerSummary: "",
    reviewWarnings: [],
    approvedFinalComments: null,
    status: "teacher_review",
    approvedBy: null,
    approvedAt: null,
    teacherReviewedBy: null,
    teacherReviewedAt: null,
    createdAt: at,
    subjectAssessment: null,
  };
}

function task(verified = true): BrailleTask {
  return {
    id: "bt_stage4_controlled",
    organisationId: "org_controlled",
    title: "Controlled Stage 4 task",
    subject: "Science",
    pupilId: null,
    status: verified ? "teacher_review" : "needs_specialist_review",
    createdBy: "u_specialist",
    assignedTo: null,
    uploadId: null,
    transcription: {
      draftText: "The woter cycle.",
      editedText: verified ? "The water cycle." : "The woter cycle.",
      finalText: verified ? "The water cycle." : null,
      status: verified ? "specialist_verified" : "needs_specialist_review",
      confidence: 0,
      lowConfidenceRegions: [],
      engine: "controlled",
      specialistVerifiedBy: verified ? "u_specialist" : null,
      specialistVerifiedAt: verified ? at : null,
      specialistNotes: "",
      brailleAccuracyFindings: [],
      subjectTeacherReviewedBy: null,
      subjectTeacherReviewedAt: null,
      provenance,
      standardsEvaluations,
      specialistCorrectionEvidence: [],
    },
    feedback: feedback(),
    rejectionReason: null,
    exportedAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

function correction(overrides: Record<string, unknown> = {}) {
  return planSpecialistCorrectionEvidence({
    id: "sce_1",
    taskId: "bt_stage4_controlled",
    reviewItemId: "tri_1",
    reviewStatus: "corrected",
    source: "flagged_passage",
    machineText: "woter",
    previousText: "woter",
    reviewedText: "water",
    evidenceCategory: "word_interpretation",
    attribution: "unknown",
    reviewerId: "u_specialist",
    reviewedAt: at,
    reviewerReason: "Checked the passage against the source evidence.",
    sourceEvidenceAvailability: "partial",
    relatedStandardRuleIds: [],
    uncertaintyState: "review_required",
    ...overrides,
  });
}

test("S4-1: correction taxonomy is bounded and contains no learner-fault category", () => {
  assert.deepEqual(SPECIALIST_CORRECTION_CATEGORIES, [
    "character", "contraction", "number_indicator", "capitalisation", "punctuation",
    "spacing", "formatting", "word_interpretation", "source_unclear", "other",
  ]);
  assert.equal(SPECIALIST_CORRECTION_CATEGORIES.some((value) => value.includes("learner")), false);
});

test("S4-2: unknown correction category and attribution values are rejected", () => {
  const category = correction({ evidenceCategory: "learner_error" });
  const attribution = correction({ attribution: "student_mistake" });
  assert.equal(category.ok, false);
  assert.equal(attribution.ok, false);
});

test("S4-3: corrected passage produces structured evidence with immutable machine/current separation", () => {
  const plan = correction();
  assert.equal(plan.ok, true);
  if (!plan.ok || !plan.evidence) return;
  assert.equal(plan.evidence.machineText, "woter");
  assert.equal(plan.evidence.previousText, "woter");
  assert.equal(plan.evidence.reviewedText, "water");
  assert.equal(plan.evidence.evidenceCategory, "word_interpretation");
  assert.equal(plan.evidence.reviewerId, "u_specialist");
  assert.equal(plan.evidence.reviewedAt, at);
  assert.equal(plan.evidence.reviewerReason, "Checked the passage against the source evidence.");
});

test("S4-4: unsupported causal certainty stays unknown and never becomes learner-error language", () => {
  const plan = correction();
  assert.equal(plan.ok, true);
  if (!plan.ok || !plan.evidence) return;
  assert.equal(plan.evidence.attribution, "unknown");
  assert.equal(JSON.stringify(plan.evidence).includes("learner_error"), false);
  assert.equal(JSON.stringify(plan.evidence).includes("student_mistake"), false);
});

test("S4-5: confirmed and needs-rescan reviews do not become text corrections", () => {
  const confirmed = correction({ reviewStatus: "confirmed" });
  const rescan = correction({ reviewStatus: "needs_rescan" });
  assert.deepEqual(confirmed, { ok: true, evidence: null });
  assert.deepEqual(rescan, { ok: true, evidence: null });
});

test("S4-6: unchanged text cannot be recorded as a correction", () => {
  const plan = correction({ reviewedText: "woter" });
  assert.equal(plan.ok, false);
});

test("S4-7: whole-document unflagged correction is represented without fabricating a machine mapping", () => {
  const plan = correction({
    id: "sce_whole",
    reviewItemId: null,
    source: "whole_document_edit",
    machineText: null,
    previousText: "Stable text.",
    reviewedText: "Carefully checked stable text.",
    evidenceCategory: "other",
    uncertaintyState: null,
  });
  assert.equal(plan.ok, true);
  if (!plan.ok || !plan.evidence) return;
  assert.equal(plan.evidence.source, "whole_document_edit");
  assert.equal(plan.evidence.machineText, null);
  assert.equal(plan.evidence.attribution, "unknown");
});

test("S4-8: append-only decisions retain earlier correction evidence", () => {
  const first = correction();
  const second = correction({
    id: "sce_2",
    previousText: "water",
    reviewedText: "water cycle",
    reviewerReason: "Expanded the specialist-verified passage after a second source check.",
  });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok || !first.evidence || !second.evidence) return;
  const records: SpecialistCorrectionEvidence[] = [first.evidence, second.evidence];
  assert.equal(records.length, 2);
  assert.equal(records[0].reviewedText, "water");
  assert.equal(records[1].reviewedText, "water cycle");
});

test("S4-9: historical correction evidence is rendered honestly as not recorded", () => {
  assert.equal(correctionEvidenceState(undefined), "not recorded");
  assert.equal(correctionEvidenceState(null), "not recorded");
  assert.equal(correctionEvidenceState([]), "not recorded");
});

test("S4-10: specialist and teacher authority are independent under current RBAC", () => {
  assert.equal(can("teaching_assistant", "transcription.specialist_verify", { brailleLiterate: true }), true);
  assert.equal(can("teaching_assistant", "feedback.approve", { brailleLiterate: true }), false);
  assert.equal(can("teacher", "feedback.approve"), true);
  assert.equal(can("teacher", "transcription.specialist_verify"), false);
  assert.equal(can("qtvi", "feedback.approve"), true); // Explicit independent permission already present.
});

test("S4-11: teacher assessment is refused before specialist verification", () => {
  const controlledTask = task(false);
  assert.match(teacherVerifiedTranscriptionError(controlledTask) ?? "", /Specialist verification/);
  const plan = planTeacherSubjectAssessment({
    task: controlledTask,
    canAssess: true,
    teacherId: "u_teacher",
    assessedAt: at,
    input: { strengths: "Clear sequence.", misconceptions: "", completeness: "complete", reasoning: "All stages are explained." },
  });
  assert.equal(plan.ok, false);
});

test("S4-12: authorised teacher assessment begins after verification and records identity/time", () => {
  const plan = planTeacherSubjectAssessment({
    task: task(true),
    canAssess: true,
    teacherId: "u_teacher",
    assessedAt: at,
    input: { strengths: "Clear sequence.", misconceptions: "", completeness: "complete", reasoning: "All stages are explained." },
  });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.assessment.assessedBy, "u_teacher");
  assert.equal(plan.assessment.assessedAt, at);
  assert.equal(plan.assessment.completeness, "complete");
});

test("S4-13: unauthorised specialist cannot perform teacher subject assessment", () => {
  const plan = planTeacherSubjectAssessment({
    task: task(true),
    canAssess: false,
    teacherId: "u_braille_literate_ta",
    assessedAt: at,
    input: { strengths: "", misconceptions: "", completeness: "complete", reasoning: "" },
  });
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.match(plan.error, /permission/);
});

test("S4-14: teacher assessment leaves provenance, standards, and specialist correction evidence unchanged", () => {
  const controlledTask = task(true);
  const correctionPlan = correction();
  assert.equal(correctionPlan.ok, true);
  if (!correctionPlan.ok || !correctionPlan.evidence) return;
  controlledTask.transcription!.specialistCorrectionEvidence = [correctionPlan.evidence];
  const protectedEvidence = structuredClone(controlledTask.transcription);
  const plan = planTeacherSubjectAssessment({
    task: controlledTask,
    canAssess: true,
    teacherId: "u_teacher",
    assessedAt: at,
    input: { strengths: "Clear sequence.", misconceptions: "", completeness: "partially_complete", reasoning: "One stage needs more explanation." },
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(controlledTask.transcription, protectedEvidence);
  assert.deepEqual(controlledTask.transcription!.provenance, provenance);
  assert.deepEqual(controlledTask.transcription!.standardsEvaluations, standardsEvaluations);
  assert.deepEqual(controlledTask.transcription!.specialistCorrectionEvidence, [correctionPlan.evidence]);
});

test("S4-15: specialist correction planning never silently creates teacher feedback", () => {
  const controlledTask = task(false);
  controlledTask.feedback = null;
  const plan = correction();
  assert.equal(plan.ok, true);
  assert.equal(controlledTask.feedback, null);
});
