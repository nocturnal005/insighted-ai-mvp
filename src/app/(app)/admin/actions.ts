"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { can, ALL_ROLES, ROLE_LABELS } from "@/lib/rbac";
import { db, purgeExpiredUploads, recordAudit, persistDb } from "@/lib/store";
import type { UserRole } from "@/lib/types";

export async function setUserRole(formData: FormData) {
  const actor = requireUser();
  if (!can(actor.role, "org.manage")) throw new Error("Not permitted");

  const userId = String(formData.get("userId"));
  const role = String(formData.get("role"));
  const target = db.users.find((u) => u.id === userId);
  if (!target) throw new Error("User not found");

  // Validate the submitted role against the known set — never cast an untrusted value.
  if (!ALL_ROLES.includes(role as UserRole)) throw new Error(`Invalid role: ${role || "(empty)"}`);
  const nextRole = role as UserRole;

  const previousRole = target.role;
  if (previousRole === nextRole) {
    revalidatePath("/admin");
    return; // no change — do not write a misleading audit entry
  }

  target.role = nextRole;
  recordAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    action: "staff.role_update",
    objectType: "User",
    objectLabel: target.fullName,
    reason: `${ROLE_LABELS[previousRole]} -> ${ROLE_LABELS[nextRole]}`,
  });
  persistDb();
  revalidatePath("/admin");
  revalidatePath("/audit");
}

/**
 * Mark or unmark a staff member as Braille-literate. This is the attribute that lets a
 * Teaching Assistant specialist-verify Braille accuracy (QTVI/Admin can always verify).
 * Accepts an explicit `brailleLiterate` ("true"/"false") or toggles when absent.
 */
export async function setBrailleLiterate(formData: FormData) {
  const actor = requireUser();
  if (!can(actor.role, "org.manage")) throw new Error("Not permitted");

  const userId = String(formData.get("userId"));
  const target = db.users.find((u) => u.id === userId);
  if (!target) throw new Error("User not found");

  const raw = formData.get("brailleLiterate");
  const previous = Boolean(target.brailleLiterate);
  const next = raw == null ? !previous : String(raw) === "true";
  if (next === previous) {
    revalidatePath("/admin");
    return;
  }

  target.brailleLiterate = next;
  recordAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    action: "staff.braille_literate_update",
    objectType: "User",
    objectLabel: target.fullName,
    reason: `Braille-literate ${previous} -> ${next}`,
  });
  persistDb();
  revalidatePath("/admin");
  revalidatePath("/audit");
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

export async function secureDeleteExpiredMaterial() {
  const actor = requireUser();
  if (!can(actor.role, "org.manage")) throw new Error("Not permitted");

  const deleted = purgeExpiredUploads(db.settings.retentionDays);
  recordAudit({
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    action: "data.delete",
    objectType: "Upload",
    objectLabel: `${deleted.length} expired upload(s)`,
    reason: `Retention ${db.settings.retentionDays} days`,
  });
  revalidatePath("/admin");
  revalidatePath("/audit");
}
