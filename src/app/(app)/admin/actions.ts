"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { db, recordAudit } from "@/lib/store";
import type { UserRole } from "@/lib/types";

export async function setUserRole(formData: FormData) {
  const actor = requireUser();
  if (!can(actor.role, "org.manage")) throw new Error("Not permitted");

  const userId = String(formData.get("userId"));
  const role = String(formData.get("role")) as UserRole;
  const target = db.users.find((u) => u.id === userId);
  if (!target) throw new Error("User not found");

  target.role = role;
  recordAudit({ actorId: actor.id, actorName: actor.fullName, action: "user.role_change", objectType: "User", objectLabel: target.fullName });
  revalidatePath("/admin");
}

export async function setRetention(formData: FormData) {
  const actor = requireUser();
  if (!can(actor.role, "org.manage")) throw new Error("Not permitted");

  const days = Number(formData.get("retentionDays"));
  if (Number.isFinite(days) && days > 0) {
    db.settings.retentionDays = Math.round(days);
    recordAudit({ actorId: actor.id, actorName: actor.fullName, action: "settings.retention", objectType: "Organisation", objectLabel: `Retention ${db.settings.retentionDays} days` });
  }
  revalidatePath("/admin");
}
