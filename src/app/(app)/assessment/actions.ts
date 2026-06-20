"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { db, id, recordAudit, createUpload } from "@/lib/store";
import { getVisualTask } from "@/lib/data";
import { draftVisualDescription } from "@/lib/braille-engine";
import type { HintTier, VisualDescriptionTask } from "@/lib/types";

export async function createVisualTask(formData: FormData) {
  const user = requireUser();
  if (!can(user.role, "task.create")) throw new Error("Not permitted");

  const title = String(formData.get("title") || "").trim();
  const subject = String(formData.get("subject") || "").trim() || null;
  const yearGroup = String(formData.get("yearGroup") || "").trim() || null;
  const pupilId = String(formData.get("pupilId") || "") || null;
  const context = String(formData.get("context") || "lesson") as "lesson" | "assessment";
  const file = formData.get("image") as File | null;
  if (!title) throw new Error("Title is required");

  const { description, flags } = draftVisualDescription(title);
  const now = new Date().toISOString();
  const task: VisualDescriptionTask = {
    id: id("vd"),
    organisationId: user.organisationId,
    title, subject, yearGroup, pupilId, context,
    hintTier: "tier_0",
    uploadId: null,
    draftDescription: description,
    editedDescription: description,
    answerSensitiveFlags: flags,
    status: "draft",
    approvedBy: null, approvedAt: null, rejectionReason: null, exportedAt: null,
    createdBy: user.id, createdAt: now, updatedAt: now,
  };
  db.visualTasks.unshift(task);
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "visual.draft", objectType: "Visual description", objectLabel: title });

  if (file && file.size > 0) {
    const buf = Buffer.from(await file.arrayBuffer());
    task.uploadId = createUpload({
      taskId: task.id, module: "visual", fileName: file.name, fileType: file.type,
      byteSize: file.size, dataUrl: `data:${file.type};base64,${buf.toString("base64")}`, uploadedBy: user,
    });
  }

  redirect(`/assessment/${task.id}`);
}

export async function updateVisual(taskId: string, editedDescription: string, hintTier: HintTier) {
  const user = requireUser();
  const task = getVisualTask(taskId);
  if (!task) throw new Error("Not found");
  if (task.status === "approved") throw new Error("Approved and locked");

  task.editedDescription = editedDescription;
  task.hintTier = hintTier;
  task.updatedAt = new Date().toISOString();
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "visual.edit", objectType: "Visual description", objectLabel: task.title });
  revalidatePath(`/assessment/${taskId}`);
}

export async function approveVisual(taskId: string) {
  const user = requireUser();
  if (!can(user.role, "visual.approve")) throw new Error("Only a teacher or QTVI can approve");
  const task = getVisualTask(taskId);
  if (!task) throw new Error("Not found");

  task.status = "approved";
  task.approvedBy = user.id;
  task.approvedAt = new Date().toISOString();
  task.updatedAt = task.approvedAt;
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "visual.approve", objectType: "Visual description", objectLabel: task.title });
  revalidatePath(`/assessment/${taskId}`);
}

export async function rejectVisual(taskId: string, reason: string) {
  const user = requireUser();
  if (!can(user.role, "task.reject")) throw new Error("Not permitted");
  const task = getVisualTask(taskId);
  if (!task) throw new Error("Not found");

  task.status = "rejected";
  task.rejectionReason = reason || "No reason given";
  task.updatedAt = new Date().toISOString();
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "task.reject", objectType: "Visual description", objectLabel: task.title });
  revalidatePath(`/assessment/${taskId}`);
}
