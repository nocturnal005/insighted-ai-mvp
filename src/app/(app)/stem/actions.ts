"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { db, id, recordAudit, createUpload } from "@/lib/store";
import { getStemTask } from "@/lib/data";
import { draftStemDescription } from "@/lib/braille-engine";
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
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "stem.draft", objectType: "STEM description", objectLabel: title });

  if (file && file.size > 0) {
    const buf = Buffer.from(await file.arrayBuffer());
    task.uploadId = createUpload({
      taskId: task.id, module: "stem", fileName: file.name, fileType: file.type,
      byteSize: file.size, dataUrl: `data:${file.type};base64,${buf.toString("base64")}`, uploadedBy: user,
    });
  }

  redirect(`/stem/${task.id}`);
}

/** Re-draft when the style changes (descriptive / instructional / assessment-safe). */
export async function restyleStem(taskId: string, style: DescriptionStyle) {
  const user = requireUser();
  const task = getStemTask(taskId);
  if (!task) throw new Error("Not found");
  if (task.status === "approved") throw new Error("Approved and locked");

  const { description, flags } = draftStemDescription(task.visualType, style);
  task.style = style;
  task.draftDescription = description;
  task.editedDescription = description;
  task.answerSensitiveFlags = flags;
  task.updatedAt = new Date().toISOString();
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "stem.restyle", objectType: "STEM description", objectLabel: task.title });
  revalidatePath(`/stem/${taskId}`);
}

export async function updateStem(taskId: string, editedDescription: string) {
  const user = requireUser();
  const task = getStemTask(taskId);
  if (!task) throw new Error("Not found");
  if (task.status === "approved") throw new Error("Approved and locked");

  task.editedDescription = editedDescription;
  task.updatedAt = new Date().toISOString();
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "stem.edit", objectType: "STEM description", objectLabel: task.title });
  revalidatePath(`/stem/${taskId}`);
}

export async function approveStem(taskId: string) {
  const user = requireUser();
  if (!can(user.role, "stem.approve")) throw new Error("Only a teacher or QTVI can approve");
  const task = getStemTask(taskId);
  if (!task) throw new Error("Not found");

  task.status = "approved";
  task.approvedBy = user.id;
  task.approvedAt = new Date().toISOString();
  task.updatedAt = task.approvedAt;
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "stem.approve", objectType: "STEM description", objectLabel: task.title });
  revalidatePath(`/stem/${taskId}`);
}
