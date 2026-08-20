import { partitionCorrectionEvidence, teacherVerifiedTranscriptionError } from "./dual-assessment.ts";
import type {
  BrailleTask,
  SpecialistCorrectionCategory,
  TeacherSubjectAssessment,
  TranscriptionReviewItem,
} from "./types.ts";

/**
 * Stage 5 uses only these explicit evidence states. They describe whether a record exists;
 * they do not make an educational, performance, or causal judgement.
 */
export type EvidenceRecordState = "recorded" | "not_recorded" | "unavailable" | "not_applicable";

export interface EvidenceCount {
  state: EvidenceRecordState;
  value: number | null;
}

export interface CorrectionCategoryCount {
  category: SpecialistCorrectionCategory;
  count: number;
}

export interface VerifiedEvidenceSummary {
  taskId: string;
  title: string;
  subject: string | null;
  submittedAt: string;
  verified: boolean;
  transcriptionRun: { state: EvidenceRecordState; id: string | null };
  machineDraft: EvidenceRecordState;
  reviewBurden: {
    flagged: EvidenceCount;
    reviewed: EvidenceCount;
    corrected: EvidenceCount;
    confirmed: EvidenceCount;
    needsRescan: EvidenceCount;
    unresolved: EvidenceCount;
    observedTranscriptionRuns: EvidenceCount;
  };
  specialistVerification: {
    state: EvidenceRecordState;
    verifiedBy: string | null;
    verifiedAt: string | null;
  };
  corrections: {
    state: EvidenceRecordState;
    currentRun: EvidenceCount;
    previousRuns: EvidenceCount;
    legacyUnscoped: EvidenceCount;
    currentRunCategories: CorrectionCategoryCount[];
    previousRunCategories: CorrectionCategoryCount[];
    legacyUnscopedCategories: CorrectionCategoryCount[];
  };
  teacherAssessment: {
    state: EvidenceRecordState;
    value: TeacherSubjectAssessment | null;
  };
  standardsDecisionSupport: EvidenceCount;
  provenance: "partial" | "unavailable" | "not_recorded";
}

/** The deliberately narrow record exposed by the learner evidence page. */
export interface LongitudinalEvidenceEntry {
  taskId: string;
  title: string;
  subject: string | null;
  submittedAt: string;
  verifiedAt: string | null;
  transcriptionRun: { state: EvidenceRecordState; id: string | null };
  specialistVerification: VerifiedEvidenceSummary["specialistVerification"];
  reviewBurden: VerifiedEvidenceSummary["reviewBurden"];
  corrections: VerifiedEvidenceSummary["corrections"];
  teacherAssessment: VerifiedEvidenceSummary["teacherAssessment"];
  standardsDecisionSupport: EvidenceCount;
  provenance: VerifiedEvidenceSummary["provenance"];
}

/**
 * Describes only the availability of bounded specialist-verification evidence.
 * It intentionally never exposes the specialist identity itself.
 */
export function specialistVerificationLabel(verifiedBy: string | null, verifiedAt: string | null): string {
  const verificationDate = verifiedAt === null ? null : new Date(verifiedAt).toLocaleDateString("en-GB");

  if (verifiedBy !== null && verificationDate !== null) return `identity and verification time recorded · ${verificationDate}`;
  if (verifiedBy !== null) return "identity recorded · verification time not recorded";
  if (verificationDate) return `identity not recorded · verification time recorded ${verificationDate}`;
  return "not recorded";
}

function count(value: number, state: EvidenceRecordState = "recorded"): EvidenceCount {
  return { state, value };
}

function notRecordedCount(): EvidenceCount {
  return { state: "not_recorded", value: null };
}

function categories(entries: ReadonlyArray<{ evidenceCategory: SpecialistCorrectionCategory }>): CorrectionCategoryCount[] {
  const byCategory = new Map<SpecialistCorrectionCategory, number>();
  for (const entry of entries) {
    byCategory.set(entry.evidenceCategory, (byCategory.get(entry.evidenceCategory) ?? 0) + 1);
  }
  return [...byCategory.entries()]
    .map(([category, total]) => ({ category, count: total }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function reviewCounts(items: readonly TranscriptionReviewItem[] | null | undefined) {
  if (!items) {
    return {
      flagged: notRecordedCount(),
      reviewed: notRecordedCount(),
      corrected: notRecordedCount(),
      confirmed: notRecordedCount(),
      needsRescan: notRecordedCount(),
      unresolved: notRecordedCount(),
    };
  }
  return {
    flagged: count(items.length),
    reviewed: count(items.filter((item) => item.reviewStatus !== "unreviewed").length),
    corrected: count(items.filter((item) => item.reviewStatus === "corrected").length),
    confirmed: count(items.filter((item) => item.reviewStatus === "confirmed").length),
    needsRescan: count(items.filter((item) => item.reviewStatus === "needs_rescan").length),
    unresolved: count(items.filter((item) => item.reviewStatus === "unreviewed").length),
  };
}

/**
 * Builds a factual submission summary from persisted task data. It intentionally omits raw
 * source images, provider payloads, transcription text, correction text, and reviewer reasons.
 */
export function buildVerifiedEvidenceSummary(task: BrailleTask): VerifiedEvidenceSummary {
  const transcription = task.transcription;
  const runId = transcription?.transcriptionRunId?.trim() || null;
  const evidence = transcription?.specialistCorrectionEvidence;
  const scoped = partitionCorrectionEvidence(evidence, runId);
  const distinctRuns = new Set<string>();
  if (runId) distinctRuns.add(runId);
  for (const correction of evidence ?? []) {
    const correctionRunId = correction.transcriptionRunId?.trim();
    if (correctionRunId) distinctRuns.add(correctionRunId);
  }
  const hasCorrectionRecord = Boolean(evidence?.length);
  const assessment = task.feedback?.subjectAssessment ?? null;
  const standards = transcription?.standardsEvaluations;

  return {
    taskId: task.id,
    title: task.title,
    subject: task.subject,
    submittedAt: task.createdAt,
    verified: teacherVerifiedTranscriptionError(task) === null,
    transcriptionRun: { state: runId ? "recorded" : "not_recorded", id: runId },
    machineDraft: transcription?.draftText ? "recorded" : "not_recorded",
    reviewBurden: {
      ...reviewCounts(transcription?.reviewItems),
      observedTranscriptionRuns: transcription ? count(distinctRuns.size) : notRecordedCount(),
    },
    specialistVerification: {
      state: transcription?.specialistVerifiedBy && transcription.specialistVerifiedAt ? "recorded" : "not_recorded",
      verifiedBy: transcription?.specialistVerifiedBy ?? null,
      verifiedAt: transcription?.specialistVerifiedAt ?? null,
    },
    corrections: {
      state: hasCorrectionRecord ? "recorded" : "not_recorded",
      currentRun: hasCorrectionRecord ? count(scoped.current.length) : notRecordedCount(),
      previousRuns: hasCorrectionRecord ? count(scoped.historical.length) : notRecordedCount(),
      legacyUnscoped: hasCorrectionRecord ? count(scoped.legacy.length) : notRecordedCount(),
      currentRunCategories: categories(scoped.current),
      previousRunCategories: categories(scoped.historical),
      legacyUnscopedCategories: categories(scoped.legacy),
    },
    teacherAssessment: {
      state: assessment ? "recorded" : "not_recorded",
      value: assessment,
    },
    standardsDecisionSupport: standards ? count(standards.length) : notRecordedCount(),
    provenance: transcription?.provenance?.availability ?? "not_recorded",
  };
}

/**
 * Chronological, verified-only learner history. This does not calculate a score, trajectory,
 * risk, grade, or any learner attribute; it keeps the underlying human-recorded evidence intact.
 */
export function buildLongitudinalEvidenceHistory(
  tasks: readonly BrailleTask[],
  pupilId: string,
): LongitudinalEvidenceEntry[] {
  return tasks
    .filter((task) => task.pupilId === pupilId && teacherVerifiedTranscriptionError(task) === null)
    .map((task) => {
      const summary = buildVerifiedEvidenceSummary(task);
      return {
        taskId: summary.taskId,
        title: summary.title,
        subject: summary.subject,
        submittedAt: summary.submittedAt,
        verifiedAt: summary.specialistVerification.verifiedAt,
        transcriptionRun: summary.transcriptionRun,
        specialistVerification: summary.specialistVerification,
        reviewBurden: summary.reviewBurden,
        corrections: summary.corrections,
        teacherAssessment: summary.teacherAssessment,
        standardsDecisionSupport: summary.standardsDecisionSupport,
        provenance: summary.provenance,
      };
    })
    .sort((a, b) => {
      const aTime = a.verifiedAt ?? a.submittedAt;
      const bTime = b.verifiedAt ?? b.submittedAt;
      return aTime.localeCompare(bTime) || a.taskId.localeCompare(b.taskId);
    });
}
