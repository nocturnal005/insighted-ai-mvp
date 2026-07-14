import type { UserRole } from "@/lib/types";

/** Permissions derived from roles — the single source of truth for authorisation. */
export type Permission =
  | "task.create"
  | "task.reject"
  | "task.archive"
  | "transcription.edit"
  | "transcription.specialist_verify"
  | "transcription.request_review"
  | "description.edit"
  | "feedback.generate"
  | "feedback.approve"
  | "visual.approve"
  | "stem.approve"
  | "export"
  | "audit.read"
  | "org.manage";

const VERIFIER: Permission[] = [
  "task.create",
  "task.reject",
  "task.archive",
  "transcription.edit",
  "transcription.request_review",
  "feedback.generate",
  "feedback.approve",
  "visual.approve",
  "stem.approve",
  "export",
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  teaching_assistant: ["task.create", "transcription.edit", "transcription.request_review", "description.edit"],
  teacher: ["task.create", "description.edit", "feedback.generate", "feedback.approve", "visual.approve", "stem.approve", "export"],
  qtvi: [...VERIFIER, "transcription.specialist_verify", "description.edit", "audit.read"],
  senco: ["task.create", "task.archive", "audit.read", "export"],
  admin: [...VERIFIER, "transcription.specialist_verify", "description.edit", "audit.read", "org.manage"],
};

export function can(role: UserRole, permission: Permission, options?: { brailleLiterate?: boolean }): boolean {
  if (permission === "transcription.specialist_verify" && role === "teaching_assistant") {
    return options?.brailleLiterate === true;
  }
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  teaching_assistant: "Teaching Assistant",
  teacher: "Teacher",
  qtvi: "QTVI",
  senco: "SENCO",
  admin: "Admin",
};

/**
 * How a staff member is identified anywhere in the UI. Staff are shown by role,
 * never by personal name — mirroring how pupils are shown by reference code
 * (VI-2026-001) rather than by name. Reads naturally in attribution, e.g.
 * "Uploaded by QTVI Staff".
 */
export const ROLE_STAFF_LABEL: Record<UserRole, string> = {
  teaching_assistant: "TA Staff",
  teacher: "Teaching Staff",
  qtvi: "QTVI Staff",
  senco: "SENCO Staff",
  admin: "Admin Staff",
};

/** Short code shown in avatar circles, in place of personal initials. */
export const ROLE_INITIALS: Record<UserRole, string> = {
  teaching_assistant: "TA",
  teacher: "TE",
  qtvi: "QT",
  senco: "SE",
  admin: "AD",
};

/** Staff label for a possibly-unknown role (older audit rows may omit it). */
export function staffLabel(role: UserRole | undefined): string {
  return role ? ROLE_STAFF_LABEL[role] : "Staff";
}

export const ROLE_BLURB: Record<UserRole, string> = {
  teaching_assistant: "Uploads work, prepares drafts",
  teacher: "Reviews verified English work and approves subject feedback",
  qtvi: "Specialist review & approval",
  senco: "Oversight, audit & reporting",
  admin: "Manages users & settings",
};

export const ALL_ROLES: UserRole[] = ["teaching_assistant", "teacher", "qtvi", "senco", "admin"];
