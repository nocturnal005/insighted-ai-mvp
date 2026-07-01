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

export const ROLE_BLURB: Record<UserRole, string> = {
  teaching_assistant: "Uploads work, prepares drafts",
  teacher: "Reviews verified English work and approves subject feedback",
  qtvi: "Specialist review & approval",
  senco: "Oversight, audit & reporting",
  admin: "Manages users & settings",
};

export const ALL_ROLES: UserRole[] = ["teaching_assistant", "teacher", "qtvi", "senco", "admin"];
