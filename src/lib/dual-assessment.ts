import type {
  BrailleTask,
  FeedbackReport,
  SpecialistCorrectionAttribution,
  SpecialistCorrectionCategory,
  SpecialistCorrectionEvidence,
  SpecialistCorrectionSource,
  SubjectContentCompleteness,
  TeacherSubjectAssessment,
  TranscriptionReviewStatus,
  TranscriptionUncertaintyState,
} from "@/lib/types";

export const SPECIALIST_CORRECTION_CATEGORIES = [
  "character",
  "contraction",
  "number_indicator",
  "capitalisation",
  "punctuation",
  "spacing",
  "formatting",
  "word_interpretation",
  "source_unclear",
  "other",
] as const satisfies readonly SpecialistCorrectionCategory[];

export const SUBJECT_CONTENT_COMPLETENESS = [
  "not_recorded",
  "complete",
  "partially_complete",
  "incomplete",
  "not_applicable",
] as const satisfies readonly SubjectContentCompleteness[];

const CORRECTION_SOURCES = [
  "flagged_passage",
  "whole_document_edit",
  "specialist_manual_review",
] as const satisfies readonly SpecialistCorrectionSource[];

const CORRECTION_ATTRIBUTIONS = [
  "machine_interpretation",
  "source_ambiguity",
  "braille_usage",
  "unknown",
] as const satisfies readonly SpecialistCorrectionAttribution[];

export interface SpecialistCorrectionRequest {
  id: string;
  taskId: string;
  transcriptionRunId: string;
  reviewItemId: string | null;
  reviewStatus: Exclude<TranscriptionReviewStatus, "unreviewed">;
  source: SpecialistCorrectionSource | string;
  machineText: string | null;
  previousText: string;
  reviewedText: string;
  evidenceCategory: SpecialistCorrectionCategory | string;
  attribution?: SpecialistCorrectionAttribution | string;
  reviewerId: string;
  reviewedAt: string;
  reviewerReason: string;
  sourceEvidenceAvailability: "partial" | "unavailable";
  relatedStandardRuleIds?: readonly string[];
  uncertaintyState: TranscriptionUncertaintyState | null;
}

export type SpecialistCorrectionPlan =
  | { ok: false; error: string }
  | { ok: true; evidence: SpecialistCorrectionEvidence | null };

/**
 * Converts a specialist review decision into append-only evidence. Confirmed and re-scan
 * decisions remain review evidence, but are deliberately not mislabelled as text corrections.
 */
export function planSpecialistCorrectionEvidence(
  request: SpecialistCorrectionRequest,
): SpecialistCorrectionPlan {
  if (request.reviewStatus !== "corrected") return { ok: true, evidence: null };
  const transcriptionRunId = request.transcriptionRunId.trim();
  if (!transcriptionRunId) {
    return { ok: false, error: "Correction evidence requires a transcription run identity" };
  }
  if (!SPECIALIST_CORRECTION_CATEGORIES.includes(request.evidenceCategory as SpecialistCorrectionCategory)) {
    return { ok: false, error: "Unknown specialist correction category" };
  }
  if (!CORRECTION_SOURCES.includes(request.source as SpecialistCorrectionSource)) {
    return { ok: false, error: "Unknown specialist correction source" };
  }
  const attribution = request.attribution ?? "unknown";
  if (!CORRECTION_ATTRIBUTIONS.includes(attribution as SpecialistCorrectionAttribution)) {
    return { ok: false, error: "Unknown specialist correction attribution" };
  }
  if (!request.reviewerId.trim() || !request.reviewedAt.trim()) {
    return { ok: false, error: "Correction evidence requires reviewer identity and time" };
  }
  const reviewerReason = request.reviewerReason.trim();
  if (!reviewerReason) return { ok: false, error: "A specialist correction reason is required" };
  if (request.reviewedText === request.previousText) {
    return { ok: false, error: "Correction evidence requires a changed reviewed transcription" };
  }
  if (request.source === "flagged_passage" && request.machineText === null) {
    return { ok: false, error: "Flagged-passage evidence requires the original machine text" };
  }

  return {
    ok: true,
    evidence: {
      id: request.id,
      taskId: request.taskId,
      transcriptionRunId,
      reviewItemId: request.reviewItemId,
      source: request.source as SpecialistCorrectionSource,
      changeType: "text_replacement",
      machineText: request.machineText,
      previousText: request.previousText,
      reviewedText: request.reviewedText,
      evidenceCategory: request.evidenceCategory as SpecialistCorrectionCategory,
      attribution: attribution as SpecialistCorrectionAttribution,
      reviewerId: request.reviewerId,
      reviewedAt: request.reviewedAt,
      reviewerReason,
      sourceEvidenceAvailability: request.sourceEvidenceAvailability,
      relatedStandardRuleIds: [...new Set(request.relatedStandardRuleIds ?? [])],
      uncertaintyState: request.uncertaintyState,
    },
  };
}

export function correctionEvidenceState(
  evidence: readonly SpecialistCorrectionEvidence[] | null | undefined,
): "recorded" | "not recorded" {
  return evidence?.length ? "recorded" : "not recorded";
}

export type CorrectionEvidenceScope = "current_run" | "historical_run" | "legacy_unscoped";

export function correctionEvidenceScope(
  evidence: SpecialistCorrectionEvidence,
  currentRunId: string | null | undefined,
): CorrectionEvidenceScope {
  const evidenceRunId = evidence.transcriptionRunId?.trim();
  const activeRunId = currentRunId?.trim();
  if (!evidenceRunId) return "legacy_unscoped";
  if (activeRunId && evidenceRunId === activeRunId) return "current_run";
  return "historical_run";
}

export function partitionCorrectionEvidence(
  evidence: readonly SpecialistCorrectionEvidence[] | null | undefined,
  currentRunId: string | null | undefined,
) {
  const current: SpecialistCorrectionEvidence[] = [];
  const historical: SpecialistCorrectionEvidence[] = [];
  const legacy: SpecialistCorrectionEvidence[] = [];
  for (const entry of evidence ?? []) {
    const scope = correctionEvidenceScope(entry, currentRunId);
    if (scope === "current_run") current.push(entry);
    else if (scope === "historical_run") historical.push(entry);
    else legacy.push(entry);
  }
  return { current, historical, legacy };
}

export interface TeacherSubjectAssessmentInput {
  strengths: string;
  misconceptions: string;
  completeness: SubjectContentCompleteness | string;
  reasoning: string;
}

export type TeacherAssessmentPlan =
  | { ok: false; error: string }
  | { ok: true; feedback: FeedbackReport; assessment: TeacherSubjectAssessment };

export function teacherVerifiedTranscriptionError(task: BrailleTask): string | null {
  if (task.status === "rejected" || task.status === "archived") return "Task is closed";
  if (task.transcription?.status !== "specialist_verified" || !task.transcription.finalText) {
    return "Specialist verification is required before teacher subject-content assessment";
  }
  return null;
}

/** Produces a new feedback object and never mutates specialist-owned transcription evidence. */
export function planTeacherSubjectAssessment(request: {
  task: BrailleTask;
  canAssess: boolean;
  teacherId: string;
  assessedAt: string;
  input: TeacherSubjectAssessmentInput;
}): TeacherAssessmentPlan {
  if (!request.canAssess) return { ok: false, error: "Teacher assessment permission is required" };
  const gateError = teacherVerifiedTranscriptionError(request.task);
  if (gateError) return { ok: false, error: gateError };
  if (!request.task.feedback) return { ok: false, error: "Create the feedback report before assessment" };
  if (request.task.feedback.status === "approved") {
    return { ok: false, error: "Feedback already approved and locked" };
  }
  if (!SUBJECT_CONTENT_COMPLETENESS.includes(request.input.completeness as SubjectContentCompleteness)) {
    return { ok: false, error: "Unknown subject-content completeness value" };
  }
  const assessment: TeacherSubjectAssessment = {
    strengths: request.input.strengths.trim(),
    misconceptions: request.input.misconceptions.trim(),
    completeness: request.input.completeness as SubjectContentCompleteness,
    reasoning: request.input.reasoning.trim(),
    assessedBy: request.teacherId,
    assessedAt: request.assessedAt,
  };
  const hasJudgement = Boolean(
    assessment.strengths ||
      assessment.misconceptions ||
      assessment.reasoning ||
      assessment.completeness !== "not_recorded",
  );
  if (!hasJudgement) return { ok: false, error: "Record at least one subject-content judgement" };

  return {
    ok: true,
    assessment,
    feedback: { ...request.task.feedback, subjectAssessment: assessment },
  };
}
