"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { db, id, recordAudit, createUpload, recordCorrection, uploadDataUrl } from "@/lib/store";
import { getTaskUpload, getPupil } from "@/lib/data";
import { hydrateBrailleTask, persistBrailleTask } from "@/lib/durable-braille";
import { transcribeBraille, mapFlagsToLowConfidenceRegions, summariseFlags, toStoredFlags } from "@/lib/ai";
import { assertVisionImageUpload } from "@/lib/upload-guard";
import { generateFeedback } from "@/lib/feedback";
import type {
  BrailleTask,
  SpecialistCorrectionCategory,
  StandardsOverrideDecision,
  TranscriptionReviewStatus,
} from "@/lib/types";
import {
  planSpecialistCorrectionEvidence,
  planTeacherSubjectAssessment,
  teacherVerifiedTranscriptionError,
  type TeacherSubjectAssessmentInput,
} from "@/lib/dual-assessment";
import { closedTaskError, planReviewItemMutation } from "@/lib/verification/review-guards";
import { buildTranscriptionProvenance } from "@/lib/provenance";
import {
  evaluateRegisteredStandards,
  planStandardsOverride,
  standardsApplicabilityForRun,
} from "@/lib/standards/evaluation";
import {
  buildTranscriptionReviewItems,
  buildUnmappedHighPriorityIssues,
  remapReviewItemsAfterWholeDocumentEdit,
  storedConfidenceEvidence,
  unresolvedRequiredReviewItems,
} from "@/lib/verification/confidence";
import { createTranscriptionRunId } from "@/lib/transcription-lineage";

export async function createBrailleTask(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "task.create")) throw new Error("Not permitted");

  const title = String(formData.get("title") || "").trim();
  const subject = String(formData.get("subject") || "").trim() || null;
  const pupilId = String(formData.get("pupilId") || "") || null;
  const file = formData.get("image") as File | null;
  if (!title) throw new Error("Title is required");
  if (!file || file.size === 0) throw new Error("A Braille work image is required");
  assertVisionImageUpload(file);
  const uploadBuffer = Buffer.from(await file.arrayBuffer());

  const now = new Date().toISOString();
  const task: BrailleTask = {
    id: id("bt"),
    organisationId: user.organisationId,
    title,
    subject,
    pupilId,
    status: "ready_for_transcription",
    createdBy: user.id,
    assignedTo: user.id,
    uploadId: null,
    transcription: null,
    feedback: null,
    rejectionReason: null,
    exportedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.brailleTasks.unshift(task);
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "task.create",
    objectType: "Braille review",
    objectLabel: title,
    taskId: task.id,
    newStatus: task.status,
  });

  task.uploadId = createUpload({
    taskId: task.id,
    module: "braille",
    fileName: file.name,
    fileType: file.type,
    byteSize: file.size,
    data: uploadBuffer,
    uploadedBy: user,
  });

  await persistBrailleTask(task, { includeUploadData: true });
  redirect(`/braille/${task.id}`);
}

/**
 * Shared OCR execution: feeds the uploaded image into the AI/OCR service, stores the draft
 * (including full AI flags + provenance), and audits an `ai.braille_ocr.run`. Used by both
 * the first run and an explicit re-run. `reason` records why a re-run happened (and can
 * carry the previous draft so a regeneration never silently discards edits).
 */
async function executeTranscription(
  user: Awaited<ReturnType<typeof requireUser>>,
  task: BrailleTask,
  reason?: string,
) {
  const previousStatus = task.status;
  const priorSpecialistCorrectionEvidence = task.transcription?.specialistCorrectionEvidence ?? [];
  const transcriptionRunId = createTranscriptionRunId();

  // Feed the uploaded image (as a data URL) into the AI/OCR service — never just the title.
  const upload = getTaskUpload(task.id);
  const dataUrl = upload ? uploadDataUrl(upload) : undefined;
  const pupil = task.pupilId ? getPupil(task.pupilId) : undefined;

  const result = await transcribeBraille({
    taskId: task.id,
    title: task.title,
    fileName: upload?.fileName,
    mimeType: upload?.fileType,
    byteSize: upload?.byteSize,
    dataUrl: dataUrl || undefined,
    subject: task.subject,
    yearGroup: pupil?.yearGroup ?? null,
    hasLinkedPupil: Boolean(task.pupilId),
  });

  const regions = mapFlagsToLowConfidenceRegions(result.flags);
  const confidenceEvidence = storedConfidenceEvidence(result);
  const reviewItems = buildTranscriptionReviewItems(result, transcriptionRunId);
  const provenance = buildTranscriptionProvenance(result);
  const standardsApplicability = standardsApplicabilityForRun(result);
  const standardsEvaluations = evaluateRegisteredStandards(
    provenance,
    standardsApplicability,
    result.meta.completedAt,
  );
  task.transcription = {
    transcriptionRunId,
    draftText: result.draftText,
    editedText: result.draftText,
    finalText: null,
    status: "needs_specialist_review",
    confidence: result.confidence,
    confidenceBasis: result.confidenceBasis,
    confidenceEvidence,
    reviewItems,
    additionalReviewIssues: buildUnmappedHighPriorityIssues(result),
    lowConfidenceRegions: regions,
    engine: result.meta.model,
    specialistVerifiedBy: null,
    specialistVerifiedAt: null,
    specialistNotes: "",
    brailleAccuracyFindings: result.flags
      .filter((f) => f.category !== "requires_specialist_review")
      .map((f) => `${f.text}: ${f.reason}`),
    subjectTeacherReviewedBy: null,
    subjectTeacherReviewedAt: null,
    aiProvider: result.meta.provider,
    aiModel: result.meta.model,
    aiMode: result.meta.mode,
    promptVersion: result.meta.promptVersion,
    processingMs: result.meta.processingMs,
    aiFlags: toStoredFlags(result.flags),
    aiRequestId: result.providerRequestId ?? null,
    rawBraille: result.rawBraille ?? null,
    review: result.review
      ? {
          status: result.review.status,
          summary: result.review.summary,
          discrepancies: result.review.discrepancies,
          rawBraille: result.review.rawBraille,
          backTranslationText: result.review.liblouisText,
          backTranslationAvailable: result.review.liblouisAvailable,
          primaryBackTranslationAgreement: result.review.primaryLiblouisAgreement,
          reviewImageCount: result.review.reviewImageCount,
          model: result.review.model,
          processingMs: result.review.processingMs,
        }
      : null,
    provenance,
    standardsEvaluations,
    specialistCorrectionEvidence: priorSpecialistCorrectionEvidence,
  };
  task.status = "needs_specialist_review";
  task.updatedAt = new Date().toISOString();
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "ai.braille_ocr.run",
    objectType: "Braille review",
    objectLabel: task.title,
    taskId: task.id,
    previousStatus,
    newStatus: task.status,
    provider: result.meta.provider,
    model: result.meta.model,
    confidence:
      confidenceEvidence.kind === "provider_score" ? confidenceEvidence.value : null,
    processingMs: result.meta.processingMs,
    aiMode: result.meta.mode,
    promptVersion: result.meta.promptVersion,
    flagSummary: summariseFlags(result.flags),
    reason: reason ?? null,
  });
  await persistBrailleTask(task, { includeUploadData: true });
  revalidatePath(`/braille/${task.id}`);
}

export async function runTranscription(taskId: string) {
  const user = await requireUser();
  const task = await hydrateBrailleTask(taskId, { includeUploadData: true });
  if (!task) throw new Error("Task not found");
  await executeTranscription(user, task);
}

/**
 * Explicitly re-run Braille OCR (e.g. after replacing the upload). Blocked once the
 * transcription is specialist-verified unless an Admin reopens it, so verified work is
 * never silently overwritten. The previous draft is preserved in the audit reason.
 */
export async function rerunBrailleTranscription(taskId: string) {
  const user = await requireUser();
  const task = await hydrateBrailleTask(taskId, { includeUploadData: true });
  if (!task) throw new Error("Task not found");
  if (task.status === "rejected" || task.status === "archived") throw new Error("Task is closed");

  const locked = task.transcription?.status === "specialist_verified";
  if (locked && user.role !== "admin") {
    throw new Error("Transcription is specialist-verified and locked. An admin must reopen it to re-run.");
  }

  const prior = task.transcription?.editedText?.trim();
  const reason = prior ? `Re-ran OCR; previous draft preserved: "${prior.slice(0, 140)}"` : "Re-ran OCR";
  await executeTranscription(user, task, reason);
}

export async function saveTranscription(
  taskId: string,
  editedText: string,
  evidenceCategory?: SpecialistCorrectionCategory | string,
  reviewerReason = "",
) {
  const user = await requireUser();
  if (!can(user.role, "transcription.edit")) throw new Error("Not permitted");
  const task = await hydrateBrailleTask(taskId);
  if (!task?.transcription) throw new Error("Nothing to edit");
  const closed = closedTaskError(task.status);
  if (closed) throw new Error(closed);
  if (task.transcription.status === "specialist_verified") throw new Error("Already verified and locked");
  const previousText = task.transcription.editedText;
  const changed = editedText !== previousText;
  const canRecordSpecialistEvidence = can(user.role, "transcription.specialist_verify", {
    brailleLiterate: user.brailleLiterate,
  });
  if ((evidenceCategory || reviewerReason.trim()) && !canRecordSpecialistEvidence) {
    throw new Error("Only authorised Braille specialists can record correction evidence");
  }
  const reviewItems = task.transcription.reviewItems ?? [];
  let remappedItems = reviewItems;
  if (reviewItems.length > 0) {
    remappedItems = remapReviewItemsAfterWholeDocumentEdit(
      previousText,
      editedText,
      reviewItems,
    );
  }

  let specialistEvidence = null;
  if (changed && canRecordSpecialistEvidence) {
    const evidencePlan = planSpecialistCorrectionEvidence({
      id: id("sce"),
      taskId: task.id,
      transcriptionRunId: task.transcription.transcriptionRunId ?? "",
      reviewItemId: null,
      reviewStatus: "corrected",
      source: "whole_document_edit",
      machineText: null,
      previousText,
      reviewedText: editedText,
      evidenceCategory: evidenceCategory ?? "other",
      attribution: "unknown",
      reviewerId: user.id,
      reviewedAt: new Date().toISOString(),
      reviewerReason,
      sourceEvidenceAvailability: task.transcription.provenance?.availability ?? "unavailable",
      relatedStandardRuleIds: [],
      uncertaintyState: null,
    });
    if (!evidencePlan.ok) throw new Error(evidencePlan.error);
    specialistEvidence = evidencePlan.evidence;
  }

  task.transcription.reviewItems = remappedItems;
  task.transcription.editedText = editedText;
  if (specialistEvidence) {
    task.transcription.specialistCorrectionEvidence = [
      ...(task.transcription.specialistCorrectionEvidence ?? []),
      specialistEvidence,
    ];
  }
  task.updatedAt = new Date().toISOString();
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: specialistEvidence ? "transcription.correction.record" : "transcription.edit",
    objectType: "Braille review",
    objectLabel: task.title,
    taskId: task.id,
    reason: specialistEvidence
      ? `${specialistEvidence.evidenceCategory}: ${specialistEvidence.reviewerReason}`
      : null,
  });
  await persistBrailleTask(task);
  revalidatePath(`/braille/${taskId}`);
}

export async function reviewTranscriptionItem(
  taskId: string,
  itemId: string,
  nextStatus: Exclude<TranscriptionReviewStatus, "unreviewed">,
  reviewedText: string,
  reviewerNote = "",
  evidenceCategory: SpecialistCorrectionCategory | string = "other",
) {
  const user = await requireUser();
  if (!can(user.role, "transcription.specialist_verify", { brailleLiterate: user.brailleLiterate })) {
    throw new Error("Only authorised Braille specialists can review flagged passages");
  }
  if (!(["confirmed", "corrected", "needs_rescan"] as const).includes(nextStatus)) {
    throw new Error("Invalid review state");
  }

  const task = await hydrateBrailleTask(taskId);
  const transcription = task?.transcription;
  if (!task || !transcription) throw new Error("Nothing to review");

  // Every rule about WHETHER this review may happen, and what it changes, lives in
  // planReviewItemMutation — including the closed-task lifecycle boundary and the
  // corrected/confirmed distinction. This action applies the plan; it does not restate it.
  const reviewedAt = new Date().toISOString();
  const plan = planReviewItemMutation({
    taskStatus: task.status,
    transcriptionStatus: transcription.status,
    editedText: transcription.editedText,
    items: transcription.reviewItems ?? [],
    itemId,
    nextStatus,
    submittedText: reviewedText,
    reviewerNote,
    reviewedBy: user.id,
    reviewedAt,
  });
  if (!plan.ok) throw new Error(plan.error);

  const previousStatus = plan.previousStatus;
  const previousItem = (transcription.reviewItems ?? []).find((candidate) => candidate.id === itemId)!;
  const item = plan.items.find((candidate) => candidate.id === itemId)!;
  const evidencePlan = planSpecialistCorrectionEvidence({
    id: id("sce"),
    taskId: task.id,
    transcriptionRunId: transcription.transcriptionRunId ?? "",
    reviewItemId: item.id,
    reviewStatus: nextStatus,
    source: "flagged_passage",
    machineText: item.machineText,
    previousText: previousItem.reviewedText,
    reviewedText: item.reviewedText,
    evidenceCategory,
    attribution: "unknown",
    reviewerId: user.id,
    reviewedAt,
    reviewerReason: reviewerNote,
    sourceEvidenceAvailability: transcription.provenance?.availability ?? "unavailable",
    relatedStandardRuleIds: [],
    uncertaintyState: item.uncertaintyState,
  });
  if (!evidencePlan.ok) throw new Error(evidencePlan.error);

  transcription.editedText = plan.editedText;
  transcription.reviewItems = plan.items;
  if (evidencePlan.evidence) {
    transcription.specialistCorrectionEvidence = [
      ...(transcription.specialistCorrectionEvidence ?? []),
      evidencePlan.evidence,
    ];
  }
  task.updatedAt = reviewedAt;

  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: `transcription.review_item.${nextStatus}`,
    objectType: "Braille review passage",
    objectLabel: task.title,
    taskId: task.id,
    previousStatus,
    newStatus: nextStatus,
    reason: evidencePlan.evidence
      ? `${evidencePlan.evidence.evidenceCategory}: ${evidencePlan.evidence.reviewerReason}`
      : item.reviewerNote || null,
  });
  await persistBrailleTask(task);
  revalidatePath(`/braille/${taskId}`);
}

export async function recordStandardsOverride(
  taskId: string,
  ruleId: string,
  decision: StandardsOverrideDecision,
  reason: string,
) {
  const user = await requireUser();
  if (!can(user.role, "transcription.specialist_verify", { brailleLiterate: user.brailleLiterate })) {
    throw new Error("Only authorised Braille specialists can record standards decisions");
  }
  const task = await hydrateBrailleTask(taskId);
  const transcription = task?.transcription;
  if (!task || !transcription) throw new Error("Nothing to review");

  const reviewedAt = new Date().toISOString();
  const plan = planStandardsOverride({
    taskStatus: task.status,
    transcriptionStatus: transcription.status,
    evaluations: transcription.standardsEvaluations ?? [],
    ruleId,
    decision,
    reviewerId: user.id,
    reviewedAt,
    reason,
  });
  if (!plan.ok) throw new Error(plan.error);

  transcription.standardsEvaluations = plan.evaluations;
  task.updatedAt = reviewedAt;
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: `transcription.standards.${decision}`,
    objectType: "Standards decision support",
    objectLabel: task.title,
    taskId: task.id,
    reason: `${ruleId}: ${reason.trim()}`,
  });
  await persistBrailleTask(task);
  revalidatePath(`/braille/${taskId}`);
}

export async function verifyTranscription(taskId: string, finalText: string, specialistNotes = "") {
  const user = await requireUser();
  if (!can(user.role, "transcription.specialist_verify", { brailleLiterate: user.brailleLiterate })) {
    throw new Error("Only QTVI, admin, or explicitly Braille-literate staff can verify Braille accuracy");
  }
  const task = await hydrateBrailleTask(taskId);
  if (!task?.transcription) throw new Error("Nothing to verify");
  if (!finalText.trim()) throw new Error("A specialist-reviewed transcription is required");
  if (task.transcription.aiMode === "mock") {
    throw new Error("Demo placeholder text cannot be specialist-verified. Run live transcription or enter a supported source workflow.");
  }
  const unresolved = unresolvedRequiredReviewItems(task.transcription.reviewItems);
  if (unresolved.length > 0) {
    throw new Error(
      `${unresolved.length} required-review passage${unresolved.length === 1 ? " is" : "s are"} unresolved`,
    );
  }
  if ((task.transcription.reviewItems ?? []).length > 0 && finalText !== task.transcription.editedText) {
    throw new Error("Save flagged-passage decisions before final specialist verification");
  }

  const previousStatus = task.status;
  task.transcription.editedText = finalText;
  task.transcription.finalText = finalText;
  task.transcription.status = "specialist_verified";
  task.transcription.specialistVerifiedBy = user.id;
  task.transcription.specialistVerifiedAt = new Date().toISOString();
  task.transcription.specialistNotes = specialistNotes;
  task.status = "specialist_verified";
  task.updatedAt = new Date().toISOString();
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "transcription.specialist_verify",
    objectType: "Braille review",
    objectLabel: task.title,
    taskId: task.id,
    previousStatus,
    newStatus: task.status,
    reason: specialistNotes || null,
  });

  // Capture the (AI draft → verified final) pair as labelled OCR quality data.
  recordCorrection({
    taskId: task.id,
    taskTitle: task.title,
    draftText: task.transcription.draftText,
    finalText,
    engine: task.transcription.engine,
    verifiedByName: user.fullName,
  });

  await persistBrailleTask(task);
  revalidatePath(`/braille/${taskId}`);
}

export async function createFeedback(taskId: string) {
  const user = await requireUser();
  if (!can(user.role, "feedback.generate")) throw new Error("Not permitted");
  const task = await hydrateBrailleTask(taskId);
  if (!task) throw new Error("Task not found");
  const gateError = teacherVerifiedTranscriptionError(task);
  if (gateError) {
    throw new Error(
      gateError.includes("Specialist verification")
        ? "Specialist verification is required before teacher feedback"
        : gateError,
    );
  }
  const transcription = task.transcription!;

  const previousStatus = task.status;
  const d = generateFeedback(transcription.finalText!);
  task.feedback = {
    summary: d.summary,
    findings: d.findings,
    specialistNotes: transcription.specialistNotes,
    subjectFeedback: d.teacherComments,
    teacherComments: d.teacherComments,
    learnerSummary: d.learnerSummary,
    reviewWarnings: d.reviewWarnings,
    approvedFinalComments: null,
    status: "teacher_review",
    approvedBy: null,
    approvedAt: null,
    teacherReviewedBy: null,
    teacherReviewedAt: null,
    createdAt: new Date().toISOString(),
    subjectAssessment: null,
  };
  task.status = "teacher_review";
  task.updatedAt = new Date().toISOString();
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "feedback.generate",
    objectType: "Feedback report",
    objectLabel: task.title,
    taskId: task.id,
    previousStatus,
    newStatus: task.status,
  });
  await persistBrailleTask(task);
  revalidatePath(`/braille/${taskId}`);
}

/** Save staff edits to the feedback report (teacher comments + learner summary). */
export async function saveFeedback(taskId: string, teacherComments: string, learnerSummary: string) {
  const user = await requireUser();
  if (!can(user.role, "feedback.generate")) throw new Error("Not permitted");
  const task = await hydrateBrailleTask(taskId);
  if (!task?.feedback) throw new Error("No feedback to edit");
  const gateError = teacherVerifiedTranscriptionError(task);
  if (gateError) throw new Error(gateError);
  if (task.feedback.status === "approved") throw new Error("Feedback already approved and locked");

  task.feedback.teacherComments = teacherComments;
  task.feedback.subjectFeedback = teacherComments;
  task.feedback.learnerSummary = learnerSummary;
  task.updatedAt = new Date().toISOString();
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "feedback.edit",
    objectType: "Feedback report",
    objectLabel: task.title,
    taskId: task.id,
  });
  await persistBrailleTask(task);
  revalidatePath(`/braille/${taskId}`);
}

/** Record teacher-owned subject-content judgement without touching specialist evidence. */
export async function saveSubjectAssessment(
  taskId: string,
  input: TeacherSubjectAssessmentInput,
) {
  const user = await requireUser();
  const canAssess = can(user.role, "feedback.approve");
  const task = await hydrateBrailleTask(taskId);
  if (!task) throw new Error("Task not found");
  const assessedAt = new Date().toISOString();
  const plan = planTeacherSubjectAssessment({
    task,
    canAssess,
    teacherId: user.id,
    assessedAt,
    input,
  });
  if (!plan.ok) throw new Error(plan.error);

  task.feedback = plan.feedback;
  task.updatedAt = assessedAt;
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "feedback.subject_assess",
    objectType: "Subject-content assessment",
    objectLabel: task.title,
    taskId: task.id,
    reason: `completeness: ${plan.assessment.completeness}`,
  });
  await persistBrailleTask(task);
  revalidatePath(`/braille/${taskId}`);
}

/** Approve the feedback report — required before it can be exported. */
export async function approveFeedback(taskId: string, teacherComments?: string, learnerSummary?: string) {
  const user = await requireUser();
  if (!can(user.role, "feedback.approve")) throw new Error("Only a teacher or QTVI can approve");
  const task = await hydrateBrailleTask(taskId);
  if (!task?.feedback) throw new Error("No feedback to approve");
  const gateError = teacherVerifiedTranscriptionError(task);
  if (gateError) throw new Error(gateError);
  const reviewedComments = String(teacherComments ?? task.feedback.teacherComments).trim();
  const reviewedSummary = String(learnerSummary ?? task.feedback.learnerSummary).trim();
  if (!reviewedComments || !reviewedSummary) {
    throw new Error("Teacher feedback and a learner-friendly summary are required");
  }

  const previousStatus = task.status;
  task.feedback.teacherComments = reviewedComments;
  task.feedback.subjectFeedback = reviewedComments;
  task.feedback.learnerSummary = reviewedSummary;
  task.feedback.status = "approved";
  task.feedback.approvedBy = user.id;
  task.feedback.approvedAt = new Date().toISOString();
  task.feedback.teacherReviewedBy = user.id;
  task.feedback.teacherReviewedAt = task.feedback.approvedAt;
  task.feedback.approvedFinalComments = reviewedComments;
  if (task.transcription) {
    task.transcription.subjectTeacherReviewedBy = user.id;
    task.transcription.subjectTeacherReviewedAt = task.feedback.approvedAt;
  }
  task.status = "approved";
  task.updatedAt = task.feedback.approvedAt;
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "feedback.approve",
    objectType: "Feedback report",
    objectLabel: task.title,
    taskId: task.id,
    previousStatus,
    newStatus: task.status,
  });
  await persistBrailleTask(task);
  revalidatePath(`/braille/${taskId}`);
}

export async function rejectBrailleTask(taskId: string, reason: string) {
  const user = await requireUser();
  if (!can(user.role, "task.reject")) throw new Error("Not permitted");
  const task = await hydrateBrailleTask(taskId);
  if (!task) throw new Error("Not found");

  const previousStatus = task.status;
  task.status = "rejected";
  task.rejectionReason = reason || "No reason given";
  task.updatedAt = new Date().toISOString();
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "task.reject",
    objectType: "Braille review",
    objectLabel: task.title,
    taskId: task.id,
    previousStatus,
    newStatus: task.status,
    reason: task.rejectionReason,
  });
  await persistBrailleTask(task);
  revalidatePath(`/braille/${taskId}`);
}

export async function archiveBrailleTask(taskId: string) {
  const user = await requireUser();
  if (!can(user.role, "task.archive")) throw new Error("Not permitted");
  const task = await hydrateBrailleTask(taskId);
  if (!task) throw new Error("Not found");

  const previousStatus = task.status;
  task.status = "archived";
  task.updatedAt = new Date().toISOString();
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "task.archive",
    objectType: "Braille review",
    objectLabel: task.title,
    taskId: task.id,
    previousStatus,
    newStatus: task.status,
  });
  await persistBrailleTask(task);
  revalidatePath(`/braille/${taskId}`);
}
