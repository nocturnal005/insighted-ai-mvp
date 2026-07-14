"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { db, id, recordAudit, createUpload, recordCorrection, uploadDataUrl } from "@/lib/store";
import { getTaskUpload, getPupil } from "@/lib/data";
import { hydrateBrailleTask, persistBrailleTask } from "@/lib/durable-braille";
import { transcribeBraille, mapFlagsToLowConfidenceRegions, summariseFlags, toStoredFlags } from "@/lib/ai";
import { assertValidUpload } from "@/lib/upload-guard";
import { generateFeedback } from "@/lib/feedback";
import type { BrailleTask } from "@/lib/types";

export async function createBrailleTask(formData: FormData) {
  const user = requireUser();
  if (!can(user.role, "task.create")) throw new Error("Not permitted");

  const title = String(formData.get("title") || "").trim();
  const subject = String(formData.get("subject") || "").trim() || null;
  const pupilId = String(formData.get("pupilId") || "") || null;
  const file = formData.get("image") as File | null;
  if (!title) throw new Error("Title is required");

  const now = new Date().toISOString();
  const task: BrailleTask = {
    id: id("bt"),
    organisationId: user.organisationId,
    title,
    subject,
    pupilId,
    status: file && file.size > 0 ? "ready_for_transcription" : "draft",
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

  if (file && file.size > 0) {
    assertValidUpload(file);
    const buf = Buffer.from(await file.arrayBuffer());
    task.uploadId = createUpload({
      taskId: task.id,
      module: "braille",
      fileName: file.name,
      fileType: file.type,
      byteSize: file.size,
      data: buf,
      uploadedBy: user,
    });
  }

  await persistBrailleTask(task);
  redirect(`/braille/${task.id}`);
}

/**
 * Shared OCR execution: feeds the uploaded image into the AI/OCR service, stores the draft
 * (including full AI flags + provenance), and audits an `ai.braille_ocr.run`. Used by both
 * the first run and an explicit re-run. `reason` records why a re-run happened (and can
 * carry the previous draft so a regeneration never silently discards edits).
 */
async function executeTranscription(
  user: ReturnType<typeof requireUser>,
  task: BrailleTask,
  reason?: string,
) {
  const previousStatus = task.status;

  // Feed the uploaded image (as a data URL) into the AI/OCR service — never just the title.
  const upload = getTaskUpload(task.id);
  const dataUrl = upload ? uploadDataUrl(upload) : undefined;
  const pupil = task.pupilId ? getPupil(task.pupilId) : undefined;

  const result = await transcribeBraille({
    taskId: task.id,
    title: task.title,
    fileName: upload?.fileName,
    mimeType: upload?.fileType,
    dataUrl: dataUrl || undefined,
    subject: task.subject,
    yearGroup: pupil?.yearGroup ?? null,
    hasLinkedPupil: Boolean(task.pupilId),
  });

  const regions = mapFlagsToLowConfidenceRegions(result.flags);
  task.transcription = {
    draftText: result.draftText,
    editedText: result.draftText,
    finalText: null,
    status: "needs_specialist_review",
    confidence: result.confidence,
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
    confidence: result.confidence,
    processingMs: result.meta.processingMs,
    aiMode: result.meta.mode,
    promptVersion: result.meta.promptVersion,
    flagSummary: summariseFlags(result.flags),
    reason: reason ?? null,
  });
  await persistBrailleTask(task);
  revalidatePath(`/braille/${task.id}`);
}

export async function runTranscription(taskId: string) {
  const user = requireUser();
  const task = await hydrateBrailleTask(taskId);
  if (!task) throw new Error("Task not found");
  await executeTranscription(user, task);
}

/**
 * Explicitly re-run Braille OCR (e.g. after replacing the upload). Blocked once the
 * transcription is specialist-verified unless an Admin reopens it, so verified work is
 * never silently overwritten. The previous draft is preserved in the audit reason.
 */
export async function rerunBrailleTranscription(taskId: string) {
  const user = requireUser();
  const task = await hydrateBrailleTask(taskId);
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

export async function saveTranscription(taskId: string, editedText: string) {
  const user = requireUser();
  if (!can(user.role, "transcription.edit")) throw new Error("Not permitted");
  const task = await hydrateBrailleTask(taskId);
  if (!task?.transcription) throw new Error("Nothing to edit");
  if (task.transcription.status === "specialist_verified") throw new Error("Already verified and locked");

  task.transcription.editedText = editedText;
  task.updatedAt = new Date().toISOString();
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "transcription.edit",
    objectType: "Braille review",
    objectLabel: task.title,
    taskId: task.id,
  });
  await persistBrailleTask(task);
  revalidatePath(`/braille/${taskId}`);
}

export async function verifyTranscription(taskId: string, finalText: string, specialistNotes = "") {
  const user = requireUser();
  if (!can(user.role, "transcription.specialist_verify", { brailleLiterate: user.brailleLiterate })) {
    throw new Error("Only QTVI, admin, or explicitly Braille-literate staff can verify Braille accuracy");
  }
  const task = await hydrateBrailleTask(taskId);
  if (!task?.transcription) throw new Error("Nothing to verify");

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
  const user = requireUser();
  if (!can(user.role, "feedback.generate")) throw new Error("Not permitted");
  const task = await hydrateBrailleTask(taskId);
  if (!task?.transcription || task.transcription.status !== "specialist_verified" || !task.transcription.finalText) {
    throw new Error("Specialist verification is required before teacher feedback");
  }

  const previousStatus = task.status;
  const d = generateFeedback(task.transcription.finalText);
  task.feedback = {
    summary: d.summary,
    findings: d.findings,
    specialistNotes: task.transcription.specialistNotes,
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
  const user = requireUser();
  if (!can(user.role, "feedback.generate")) throw new Error("Not permitted");
  const task = await hydrateBrailleTask(taskId);
  if (!task?.feedback) throw new Error("No feedback to edit");
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

/** Approve the feedback report — required before it can be exported. */
export async function approveFeedback(taskId: string) {
  const user = requireUser();
  if (!can(user.role, "feedback.approve")) throw new Error("Only a teacher or QTVI can approve");
  const task = await hydrateBrailleTask(taskId);
  if (!task?.feedback) throw new Error("No feedback to approve");

  const previousStatus = task.status;
  task.feedback.status = "approved";
  task.feedback.approvedBy = user.id;
  task.feedback.approvedAt = new Date().toISOString();
  task.feedback.teacherReviewedBy = user.id;
  task.feedback.teacherReviewedAt = task.feedback.approvedAt;
  task.feedback.approvedFinalComments = task.feedback.teacherComments;
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
  const user = requireUser();
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
  const user = requireUser();
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
