"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { db, id, recordAudit, createUpload, uploadDataUrl } from "@/lib/store";
import { getStemTask, getTaskUpload } from "@/lib/data";
import { describeStemVisual, mapFlagsToAnswerSensitiveFlags, summariseFlags, toStoredFlags } from "@/lib/ai";
import { assertValidUpload } from "@/lib/upload-guard";
import type { DescriptionStyle, StemTask, VisualType } from "@/lib/types";

export async function createStemTask(formData: FormData) {
  const user = requireUser();
  if (!can(user.role, "task.create")) throw new Error("Not permitted");

  const title = String(formData.get("title") || "").trim();
  const subject = String(formData.get("subject") || "").trim() || null;
  const yearGroup = String(formData.get("yearGroup") || "").trim() || null;
  const pupilId = String(formData.get("pupilId") || "") || null;
  const visualType = String(formData.get("visualType") || "line_graph") as VisualType;
  const style = String(formData.get("style") || "descriptive") as DescriptionStyle;
  const file = formData.get("image") as File | null;
  if (!title) throw new Error("Title is required");

  const now = new Date().toISOString();
  const task: StemTask = {
    id: id("st"),
    organisationId: user.organisationId,
    title, subject, yearGroup, pupilId, visualType, style,
    uploadId: null,
    draftDescription: "",
    editedDescription: "",
    answerSensitiveFlags: [],
    status: "draft",
    approvedBy: null, approvedAt: null, rejectionReason: null, exportedAt: null,
    createdBy: user.id, createdAt: now, updatedAt: now,
    aiProvider: null, aiModel: null, aiMode: null, confidence: null, promptVersion: null, processingMs: null,
  };
  db.stemTasks.unshift(task);

  // Store the upload (if any) and capture its bytes to feed the vision provider.
  let dataUrl: string | undefined;
  if (file && file.size > 0) {
    assertValidUpload(file);
    const buf = Buffer.from(await file.arrayBuffer());
    task.uploadId = createUpload({
      taskId: task.id, module: "stem", fileName: file.name, fileType: file.type,
      byteSize: file.size, data: buf, uploadedBy: user,
    });
    dataUrl = `data:${file.type};base64,${buf.toString("base64")}`;
  }

  await generateStemDescription(user, task, dataUrl, task.style);

  redirect(`/stem/${task.id}`);
}

/**
 * Shared: run `describeStemVisual` for a task at a given style, store the draft + full AI
 * flags + provenance, and audit `ai.stem_description.run`. Only non-identifying context is
 * sent to the provider, plus a boolean pupil-link for the safety guard.
 */
async function generateStemDescription(
  user: ReturnType<typeof requireUser>,
  task: StemTask,
  dataUrl: string | undefined,
  style: DescriptionStyle,
  reason?: string,
) {
  const result = await describeStemVisual({
    taskId: task.id,
    title: task.title,
    subject: task.subject,
    yearGroup: task.yearGroup,
    context: "lesson",
    visualType: task.visualType,
    style,
    dataUrl: dataUrl || undefined,
    hasLinkedPupil: Boolean(task.pupilId),
  });

  task.style = style;
  task.draftDescription = result.structuredDescription;
  task.editedDescription = result.structuredDescription;
  task.answerSensitiveFlags = mapFlagsToAnswerSensitiveFlags(result.answerSensitiveFlags);
  task.aiProvider = result.meta.provider;
  task.aiModel = result.meta.model;
  task.aiMode = result.meta.mode;
  task.confidence = result.confidence;
  task.promptVersion = result.meta.promptVersion;
  task.processingMs = result.meta.processingMs;
  task.aiFlags = toStoredFlags(result.answerSensitiveFlags);
  task.updatedAt = new Date().toISOString();

  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "ai.stem_description.run",
    objectType: "STEM description",
    objectLabel: task.title,
    taskId: task.id,
    newStatus: task.status,
    provider: result.meta.provider,
    model: result.meta.model,
    confidence: result.confidence,
    processingMs: result.meta.processingMs,
    aiMode: result.meta.mode,
    promptVersion: result.meta.promptVersion,
    flagSummary: summariseFlags(result.answerSensitiveFlags),
    reason: reason ?? null,
  });
}

/** Re-draft when the style changes (descriptive / instructional / assessment-safe). */
export async function restyleStem(taskId: string, style: DescriptionStyle) {
  const user = requireUser();
  if (!can(user.role, "description.edit")) throw new Error("Not permitted to edit descriptions");
  const task = getStemTask(taskId);
  if (!task) throw new Error("Not found");
  if (task.status === "approved") throw new Error("Approved and locked");

  // Reuse the same uploaded image; re-run the vision provider with the new style.
  const upload = getTaskUpload(task.id);
  const dataUrl = upload ? uploadDataUrl(upload) : undefined;
  await generateStemDescription(user, task, dataUrl || undefined, style);
  revalidatePath(`/stem/${taskId}`);
}

/** Explicitly re-run the STEM description from the stored upload. Blocked once approved. */
export async function rerunStemDescription(taskId: string) {
  const user = requireUser();
  if (!can(user.role, "description.edit")) throw new Error("Not permitted to edit descriptions");
  const task = getStemTask(taskId);
  if (!task) throw new Error("Not found");
  if (task.status === "approved") throw new Error("Approved and locked. An admin must reopen it to re-run.");

  const prior = task.editedDescription?.trim();
  const reason = prior ? `Re-ran description; previous text preserved: "${prior.slice(0, 140)}"` : "Re-ran description";
  const upload = getTaskUpload(task.id);
  const dataUrl = upload ? uploadDataUrl(upload) : undefined;
  await generateStemDescription(user, task, dataUrl || undefined, task.style, reason);
  revalidatePath(`/stem/${taskId}`);
}

export async function updateStem(taskId: string, editedDescription: string) {
  const user = requireUser();
  if (!can(user.role, "description.edit")) throw new Error("Not permitted to edit descriptions");
  const task = getStemTask(taskId);
  if (!task) throw new Error("Not found");
  if (task.status === "approved") throw new Error("Approved and locked");

  task.editedDescription = editedDescription;
  task.updatedAt = new Date().toISOString();
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "stem.edit",
    objectType: "STEM description",
    objectLabel: task.title,
    taskId: task.id,
  });
  revalidatePath(`/stem/${taskId}`);
}

export async function approveStem(taskId: string, editedDescription?: string) {
  const user = requireUser();
  if (!can(user.role, "stem.approve")) throw new Error("Only a teacher or QTVI can approve");
  const task = getStemTask(taskId);
  if (!task) throw new Error("Not found");

  const previousStatus = task.status;
  if (typeof editedDescription === "string") task.editedDescription = editedDescription;
  task.status = "approved";
  task.approvedBy = user.id;
  task.approvedAt = new Date().toISOString();
  task.updatedAt = task.approvedAt;
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "stem.approve",
    objectType: "STEM description",
    objectLabel: task.title,
    taskId: task.id,
    previousStatus,
    newStatus: task.status,
  });
  revalidatePath(`/stem/${taskId}`);
}
