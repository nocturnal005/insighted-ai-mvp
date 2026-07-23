"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { db, id, recordAudit, createUpload, uploadDataUrl } from "@/lib/store";
import { getVisualTask, getTaskUpload } from "@/lib/data";
import { describeVisual, mapFlagsToAnswerSensitiveFlags, summariseFlags, toStoredFlags } from "@/lib/ai";
import { assertVisionImageUpload } from "@/lib/upload-guard";
import { hasCompleteAssessmentContext, isAssessmentLikeContext, parseAssessmentContext } from "@/lib/assessment-context";
import type { HintTier, VisualDescriptionTask } from "@/lib/types";

export async function createVisualTask(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "task.create")) throw new Error("Not permitted");

  const title = String(formData.get("title") || "").trim();
  const subject = String(formData.get("subject") || "").trim() || null;
  const yearGroup = String(formData.get("yearGroup") || "").trim() || null;
  const pupilId = String(formData.get("pupilId") || "") || null;
  const context = parseAssessmentContext(formData.get("context"), "lesson");
  const questionPrompt = String(formData.get("questionPrompt") || "").trim() || null;
  const assessedSkill = String(formData.get("assessedSkill") || "").trim() || null;
  const file = formData.get("image") as File | null;
  if (!title) throw new Error("Title is required");
  if (!file || file.size === 0) throw new Error("A source visual is required");
  assertVisionImageUpload(file);
  if (!hasCompleteAssessmentContext(context, questionPrompt, assessedSkill)) {
    throw new Error("Question prompt and assessed skill are required for assessment use");
  }
  const uploadBuffer = Buffer.from(await file.arrayBuffer());

  const now = new Date().toISOString();
  const task: VisualDescriptionTask = {
    id: id("vd"),
    organisationId: user.organisationId,
    title, subject, yearGroup, pupilId, context, questionPrompt, assessedSkill,
    hintTier: "tier_0",
    uploadId: null,
    draftDescription: "",
    editedDescription: "",
    answerSensitiveFlags: [],
    status: "draft",
    approvedBy: null, approvedAt: null, rejectionReason: null, exportedAt: null,
    createdBy: user.id, createdAt: now, updatedAt: now,
    aiProvider: null, aiModel: null, aiMode: null, confidence: null, promptVersion: null, processingMs: null,
  };
  db.visualTasks.unshift(task);

  // Store the upload (if any) and capture its bytes to feed the vision provider.
  task.uploadId = createUpload({
    taskId: task.id, module: "visual", fileName: file.name, fileType: file.type,
    byteSize: file.size, data: uploadBuffer, uploadedBy: user,
  });
  const dataUrl = `data:${file.type};base64,${uploadBuffer.toString("base64")}`;

  // Generate the neutral, assessment-safe description from the image + assessment context.
  await generateVisualDescription(user, task, dataUrl);

  redirect(`/assessment/${task.id}`);
}

/**
 * Shared: run `describeVisual` for a task, store the draft + full AI flags + provenance,
 * and audit `ai.visual_description.run`. Only non-identifying context is sent to the
 * provider (title/subject/year group/prompt/skill/image) plus a boolean pupil-link.
 */
async function generateVisualDescription(
  user: Awaited<ReturnType<typeof requireUser>>,
  task: VisualDescriptionTask,
  dataUrl: string | undefined,
  reason?: string,
) {
  const upload = getTaskUpload(task.id);
  const result = await describeVisual({
    taskId: task.id,
    title: task.title,
    fileName: upload?.fileName,
    mimeType: upload?.fileType,
    subject: task.subject,
    yearGroup: task.yearGroup,
    context: task.context,
    hintTier: task.hintTier,
    questionPrompt: task.questionPrompt,
    assessedSkill: task.assessedSkill,
    dataUrl,
    hasLinkedPupil: Boolean(task.pupilId),
  });

  // Preserve the reviewer's working text before a re-run/regenerate overwrites it, but only
  // when it diverged from the last AI draft (i.e. a human changed it), so nothing is kept on
  // first generation and no reviewed version is ever lost silently.
  if (task.editedDescription.trim() && task.editedDescription !== task.draftDescription) {
    task.previousDescription = task.editedDescription;
  }
  task.draftDescription = result.neutralDescription;
  task.editedDescription = result.neutralDescription;
  task.answerSensitiveFlags = mapFlagsToAnswerSensitiveFlags(result.answerSensitiveFlags);
  task.aiProvider = result.meta.provider;
  task.aiModel = result.meta.model;
  task.aiMode = result.meta.mode;
  const storedConfidence = result.meta.mode === "mock" ? null : result.confidence;
  task.confidence = storedConfidence;
  task.promptVersion = result.meta.promptVersion;
  task.processingMs = result.meta.processingMs;
  task.aiFlags = toStoredFlags(result.answerSensitiveFlags);
  task.updatedAt = new Date().toISOString();

  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "ai.visual_description.run",
    objectType: "Visual description",
    objectLabel: task.title,
    taskId: task.id,
    newStatus: task.status,
    provider: result.meta.provider,
    model: result.meta.model,
    confidence: storedConfidence,
    processingMs: result.meta.processingMs,
    aiMode: result.meta.mode,
    promptVersion: result.meta.promptVersion,
    flagSummary: summariseFlags(result.answerSensitiveFlags),
    reason: reason ?? null,
  });
}

/**
 * Edit assessment-safety metadata (question prompt, assessed skill, context, hint tier)
 * after creation, then regenerate the description so answer-sensitivity is re-evaluated
 * against the new context. Blocked once approved.
 */
export async function updateVisualContext(taskId: string, formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "description.edit")) throw new Error("Not permitted to edit descriptions");
  const task = getVisualTask(taskId);
  if (!task) throw new Error("Not found");
  if (task.status === "approved") throw new Error("Approved and locked");

  task.questionPrompt = String(formData.get("questionPrompt") || "").trim() || null;
  task.assessedSkill = String(formData.get("assessedSkill") || "").trim() || null;
  task.context = parseAssessmentContext(formData.get("context"), task.context);
  const tier = String(formData.get("hintTier") || task.hintTier) as HintTier;
  if (tier === "tier_0" || tier === "tier_1" || tier === "tier_2") task.hintTier = tier;
  task.updatedAt = new Date().toISOString();

  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "visual.context.edit",
    objectType: "Visual description",
    objectLabel: task.title,
    taskId: task.id,
    reason:
      isAssessmentLikeContext(task.context) && (!task.questionPrompt || !task.assessedSkill)
        ? "Assessment context set without question prompt and/or assessed skill"
        : null,
  });

  // Re-run using the stored upload so the new context is reflected in the draft + flags.
  const upload = getTaskUpload(task.id);
  const dataUrl = upload ? uploadDataUrl(upload) : undefined;
  await generateVisualDescription(user, task, dataUrl || undefined, "Regenerated after assessment-context edit");
  revalidatePath(`/assessment/${taskId}`);
}

/** Explicitly re-run the visual description from the stored upload. Blocked once approved. */
export async function rerunVisualDescription(taskId: string) {
  const user = await requireUser();
  if (!can(user.role, "description.edit")) throw new Error("Not permitted to edit descriptions");
  const task = getVisualTask(taskId);
  if (!task) throw new Error("Not found");
  if (task.status === "approved") throw new Error("Approved and locked. An admin must reopen it to re-run.");

  const prior = task.editedDescription?.trim();
  const reason = prior ? `Re-ran description; previous text preserved: "${prior.slice(0, 140)}"` : "Re-ran description";
  const upload = getTaskUpload(task.id);
  const dataUrl = upload ? uploadDataUrl(upload) : undefined;
  await generateVisualDescription(user, task, dataUrl || undefined, reason);
  revalidatePath(`/assessment/${taskId}`);
}

export async function updateVisual(taskId: string, editedDescription: string, hintTier: HintTier) {
  const user = await requireUser();
  if (!can(user.role, "description.edit")) throw new Error("Not permitted to edit descriptions");
  const task = getVisualTask(taskId);
  if (!task) throw new Error("Not found");
  if (task.status === "approved") throw new Error("Approved and locked");

  task.editedDescription = editedDescription;
  task.hintTier = hintTier;
  task.updatedAt = new Date().toISOString();
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "visual.edit",
    objectType: "Visual description",
    objectLabel: task.title,
    taskId: task.id,
  });
  revalidatePath(`/assessment/${taskId}`);
}

export async function approveVisual(taskId: string, editedDescription?: string, hintTier?: HintTier) {
  const user = await requireUser();
  if (!can(user.role, "visual.approve")) throw new Error("Only a teacher or QTVI can approve");
  const task = getVisualTask(taskId);
  if (!task) throw new Error("Not found");
  const upload = getTaskUpload(taskId);
  if (!upload || !uploadDataUrl(upload)) throw new Error("The source visual is unavailable. Re-upload it before approval.");
  if (!hasCompleteAssessmentContext(task.context, task.questionPrompt, task.assessedSkill)) {
    throw new Error("Add the question prompt and assessed skill, then regenerate before approval.");
  }
  if (!String(editedDescription ?? task.editedDescription).trim()) throw new Error("A reviewed description is required");
  const blockingFlag = (task.aiFlags ?? []).find((flag) =>
    ["provider_unavailable", "processing_failed", "real_pupil_data_blocked", "pdf_processing_pending"].includes(flag.category),
  );
  if (blockingFlag) throw new Error(`Approval blocked: ${blockingFlag.reason}`);

  const previousStatus = task.status;
  if (typeof editedDescription === "string") task.editedDescription = editedDescription;
  if (hintTier) task.hintTier = hintTier;
  task.status = "approved";
  task.approvedBy = user.id;
  task.approvedAt = new Date().toISOString();
  task.updatedAt = task.approvedAt;
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "visual.approve",
    objectType: "Visual description",
    objectLabel: task.title,
    taskId: task.id,
    previousStatus,
    newStatus: task.status,
  });
  revalidatePath(`/assessment/${taskId}`);
}

export async function rejectVisual(taskId: string, reason: string) {
  const user = await requireUser();
  if (!can(user.role, "task.reject")) throw new Error("Not permitted");
  const task = getVisualTask(taskId);
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
    objectType: "Visual description",
    objectLabel: task.title,
    taskId: task.id,
    previousStatus,
    newStatus: task.status,
    reason: task.rejectionReason,
  });
  revalidatePath(`/assessment/${taskId}`);
}
