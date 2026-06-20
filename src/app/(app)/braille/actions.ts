"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { db, id, recordAudit, createUpload, recordCorrection } from "@/lib/store";
import { getBrailleTask } from "@/lib/data";
import { getBrailleEngine } from "@/lib/braille-engine";
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
    status: "draft",
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
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "task.create", objectType: "Braille review", objectLabel: title });

  if (file && file.size > 0) {
    const buf = Buffer.from(await file.arrayBuffer());
    task.uploadId = createUpload({
      taskId: task.id,
      module: "braille",
      fileName: file.name,
      fileType: file.type,
      byteSize: file.size,
      dataUrl: `data:${file.type};base64,${buf.toString("base64")}`,
      uploadedBy: user,
    });
  }

  redirect(`/braille/${task.id}`);
}

export async function runTranscription(taskId: string) {
  const user = requireUser();
  const task = getBrailleTask(taskId);
  if (!task) throw new Error("Task not found");

  const result = await getBrailleEngine().transcribe(task.id);
  task.transcription = {
    draftText: result.text,
    editedText: result.text,
    finalText: null,
    status: "draft",
    confidence: result.confidence,
    lowConfidenceRegions: result.lowConfidenceRegions,
    engine: result.engine,
    verifiedBy: null,
    verifiedAt: null,
  };
  task.status = "needs_review";
  task.updatedAt = new Date().toISOString();
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "transcription.draft", objectType: "Braille review", objectLabel: task.title });
  revalidatePath(`/braille/${taskId}`);
}

export async function saveTranscription(taskId: string, editedText: string) {
  const user = requireUser();
  if (!can(user.role, "transcription.edit")) throw new Error("Not permitted");
  const task = getBrailleTask(taskId);
  if (!task?.transcription) throw new Error("Nothing to edit");
  if (task.transcription.status === "verified") throw new Error("Already verified and locked");

  task.transcription.editedText = editedText;
  task.updatedAt = new Date().toISOString();
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "transcription.edit", objectType: "Braille review", objectLabel: task.title });
  revalidatePath(`/braille/${taskId}`);
}

export async function verifyTranscription(taskId: string, finalText: string) {
  const user = requireUser();
  if (!can(user.role, "transcription.verify")) throw new Error("Only a teacher or QTVI can verify");
  const task = getBrailleTask(taskId);
  if (!task?.transcription) throw new Error("Nothing to verify");

  task.transcription.editedText = finalText;
  task.transcription.finalText = finalText;
  task.transcription.status = "verified";
  task.transcription.verifiedBy = user.id;
  task.transcription.verifiedAt = new Date().toISOString();
  task.status = "approved";
  task.updatedAt = new Date().toISOString();
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "transcription.verify", objectType: "Braille review", objectLabel: task.title });

  // Capture the (AI draft → verified final) pair as labelled OCR quality data.
  recordCorrection({
    taskId: task.id,
    taskTitle: task.title,
    draftText: task.transcription.draftText,
    finalText,
    engine: task.transcription.engine,
    verifiedByName: user.fullName,
  });

  revalidatePath(`/braille/${taskId}`);
}

export async function createFeedback(taskId: string) {
  const user = requireUser();
  if (!can(user.role, "feedback.generate")) throw new Error("Not permitted");
  const task = getBrailleTask(taskId);
  if (!task?.transcription || task.transcription.status !== "verified" || !task.transcription.finalText) {
    throw new Error("Verify the transcription first");
  }

  const d = generateFeedback(task.transcription.finalText);
  task.feedback = {
    summary: d.summary,
    findings: d.findings,
    teacherComments: d.teacherComments,
    learnerSummary: d.learnerSummary,
    status: "draft",
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date().toISOString(),
  };
  task.updatedAt = new Date().toISOString();
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "feedback.generate", objectType: "Feedback report", objectLabel: task.title });
  revalidatePath(`/braille/${taskId}`);
}

/** Save staff edits to the feedback report (teacher comments + learner summary). */
export async function saveFeedback(taskId: string, teacherComments: string, learnerSummary: string) {
  const user = requireUser();
  if (!can(user.role, "feedback.generate")) throw new Error("Not permitted");
  const task = getBrailleTask(taskId);
  if (!task?.feedback) throw new Error("No feedback to edit");
  if (task.feedback.status === "approved") throw new Error("Feedback already approved and locked");

  task.feedback.teacherComments = teacherComments;
  task.feedback.learnerSummary = learnerSummary;
  task.updatedAt = new Date().toISOString();
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "feedback.edit", objectType: "Feedback report", objectLabel: task.title });
  revalidatePath(`/braille/${taskId}`);
}

/** Approve the feedback report — required before it can be exported. */
export async function approveFeedback(taskId: string) {
  const user = requireUser();
  if (!can(user.role, "feedback.approve")) throw new Error("Only a teacher or QTVI can approve");
  const task = getBrailleTask(taskId);
  if (!task?.feedback) throw new Error("No feedback to approve");

  task.feedback.status = "approved";
  task.feedback.approvedBy = user.id;
  task.feedback.approvedAt = new Date().toISOString();
  task.updatedAt = task.feedback.approvedAt;
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "feedback.approve", objectType: "Feedback report", objectLabel: task.title });
  revalidatePath(`/braille/${taskId}`);
}

export async function rejectBrailleTask(taskId: string, reason: string) {
  const user = requireUser();
  if (!can(user.role, "task.reject")) throw new Error("Not permitted");
  const task = getBrailleTask(taskId);
  if (!task) throw new Error("Not found");

  task.status = "rejected";
  task.rejectionReason = reason || "No reason given";
  task.updatedAt = new Date().toISOString();
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "task.reject", objectType: "Braille review", objectLabel: task.title });
  revalidatePath(`/braille/${taskId}`);
}

export async function archiveBrailleTask(taskId: string) {
  const user = requireUser();
  if (!can(user.role, "task.archive")) throw new Error("Not permitted");
  const task = getBrailleTask(taskId);
  if (!task) throw new Error("Not found");

  task.status = "archived";
  task.updatedAt = new Date().toISOString();
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "task.archive", objectType: "Braille review", objectLabel: task.title });
  revalidatePath(`/braille/${taskId}`);
}
