"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { db, id, recordAudit, createUpload } from "@/lib/store";
import { getStemTask } from "@/lib/data";
import { draftStemDescription } from "@/lib/braille-engine";
import type { DescriptionStyle, StemTask, VisualType } from "@/lib/types";

const ALLOWED_UPLOAD_TYPES = new Set(["image/png", "image/jpeg", "application/pdf"]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function assertValidUpload(file: File): void {
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) throw new Error("Upload must be PNG, JPG, JPEG, or PDF");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Upload must be 10MB or smaller");
}

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

  const { description, flags } = draftStemDescription(visualType, style);
  const now = new Date().toISOString();
  const task: StemTask = {
    id: id("st"),
    organisationId: user.organisationId,
    title, subject, yearGroup, pupilId, visualType, style,
    uploadId: null,
    draftDescription: description,
    editedDescription: description,
    answerSensitiveFlags: flags,
    status: "draft",
    approvedBy: null, approvedAt: null, rejectionReason: null, exportedAt: null,
    createdBy: user.id, createdAt: now, updatedAt: now,
  };
  db.stemTasks.unshift(task);
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "stem.draft",
    objectType: "STEM description",
    objectLabel: title,
    taskId: task.id,
    newStatus: task.status,
  });

  if (file && file.size > 0) {
    assertValidUpload(file);
    const buf = Buffer.from(await file.arrayBuffer());
    task.uploadId = createUpload({
      taskId: task.id, module: "stem", fileName: file.name, fileType: file.type,
      byteSize: file.size, data: buf, uploadedBy: user,
    });
  }

  redirect(`/stem/${task.id}`);
}

/** Re-draft when the style changes (descriptive / instructional / assessment-safe). */
export async function restyleStem(taskId: string, style: DescriptionStyle) {
  const user = requireUser();
  if (!can(user.role, "description.edit")) throw new Error("Not permitted to edit descriptions");
  const task = getStemTask(taskId);
  if (!task) throw new Error("Not found");
  if (task.status === "approved") throw new Error("Approved and locked");

  const { description, flags } = draftStemDescription(task.visualType, style);
  task.style = style;
  task.draftDescription = description;
  task.editedDescription = description;
  task.answerSensitiveFlags = flags;
  task.updatedAt = new Date().toISOString();
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "stem.restyle",
    objectType: "STEM description",
    objectLabel: task.title,
    taskId: task.id,
  });
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
