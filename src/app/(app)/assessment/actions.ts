"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { db, id, recordAudit, createUpload, uploadDataUrl } from "@/lib/store";
import { getVisualTask, getTaskUpload } from "@/lib/data";
import { describeVisual, mapFlagsToAnswerSensitiveFlags, summariseFlags, toStoredFlags } from "@/lib/ai";
import { assertValidUpload } from "@/lib/upload-guard";
import type { HintTier, VisualDescriptionTask } from "@/lib/types";

/** Contexts where a missing prompt/skill is an assessment-safety risk worth surfacing. */
const ASSESSMENT_CONTEXTS = new Set(["class_test", "mock_assessment", "formal_assessment_preparation", "assessment"]);

export async function createVisualTask(formData: FormData) {
  const user = requireUser();
  if (!can(user.role, "task.create")) throw new Error("Not permitted");

  const title = String(formData.get("title") || "").trim();
  const subject = String(formData.get("subject") || "").trim() || null;
  const yearGroup = String(formData.get("yearGroup") || "").trim() || null;
  const pupilId = String(formData.get("pupilId") || "") || null;
  const context = String(formData.get("context") || "lesson") as VisualDescriptionTask["context"];
  const questionPrompt = String(formData.get("questionPrompt") || "").trim() || null;
  const assessedSkill = String(formData.get("assessedSkill") || "").trim() || null;
  const file = formData.get("image") as File | null;
  if (!title) throw new Error("Title is required");

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
  let dataUrl: string | undefined;
  if (file && file.size > 0) {
    assertValidUpload(file);
    const buf = Buffer.from(await file.arrayBuffer());
    task.uploadId = createUpload({
      taskId: task.id, module: "visual", fileName: file.name, fileType: file.type,
      byteSize: file.size, data: buf, uploadedBy: user,
    });
    dataUrl = `data:${file.type};base64,${buf.toString("base64")}`;
  }

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
  user: ReturnType<typeof requireUser>,
  task: VisualDescriptionTask,
  dataUrl: string | undefined,
  reason?: string,
) {
  const result = await describeVisual({
    taskId: task.id,
    title: task.title,
    subject: task.subject,
    yearGroup: task.yearGroup,
    context: task.context,
    hintTier: task.hintTier,
    questionPrompt: task.questionPrompt,
    assessedSkill: task.assessedSkill,
    dataUrl,
    hasLinkedPupil: Boolean(task.pupilId),
  });

  task.draftDescription = result.neutralDescription;
  task.editedDescription = result.neutralDescription;
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
    action: "ai.visual_description.run",
    objectType: "Visual description",
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

/**
 * Edit assessment-safety metadata (question prompt, assessed skill, context, hint tier)
 * after creation, then regenerate the description so answer-sensitivity is re-evaluated
 * against the new context. Blocked once approved.
 */
export async function updateVisualContext(taskId: string, formData: FormData) {
  const user = requireUser();
  if (!can(user.role, "description.edit")) throw new Error("Not permitted to edit descriptions");
  const task = getVisualTask(taskId);
  if (!task) throw new Error("Not found");
  if (task.status === "approved") throw new Error("Approved and locked");

  task.questionPrompt = String(formData.get("questionPrompt") || "").trim() || null;
  task.assessedSkill = String(formData.get("assessedSkill") || "").trim() || null;
  task.context = String(formData.get("context") || task.context) as VisualDescriptionTask["context"];
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
      ASSESSMENT_CONTEXTS.has(task.context) && (!task.questionPrompt || !task.assessedSkill)
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
  const user = requireUser();
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
  const user = requireUser();
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
  const user = requireUser();
  if (!can(user.role, "visual.approve")) throw new Error("Only a teacher or QTVI can approve");
  const task = getVisualTask(taskId);
  if (!task) throw new Error("Not found");

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
  const user = requireUser();
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
