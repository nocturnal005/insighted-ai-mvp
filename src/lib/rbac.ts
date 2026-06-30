import type { UserRole } from "@/lib/types";

/** Permissions derived from roles — the single source of truth for authorisation. */
export type Permission =
  | "task.create"
  | "task.reject"
  | "task.archive"
  | "transcription.edit"
  | "transcription.verify"
  | "feedback.generate"
  | "feedback.approve"
  | "description.edit"
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
  "transcription.verify",
  "feedback.generate",
  "feedback.approve",
  "description.edit",
  "visual.approve",
  "stem.approve",
  "export",
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  teaching_assistant: ["task.create", "transcription.edit", "description.edit", "export"],
  teacher: VERIFIER,
  qtvi: [...VERIFIER, "audit.read"],
  senco: ["task.create", "task.archive", "audit.read", "export"],
  admin: [...VERIFIER, "audit.read", "org.manage"],
};

export function can(role: UserRole, permission: Permission): boolean {
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
  teacher: "Verifies & marks, approves feedback",
  qtvi: "Specialist review & approval",
  senco: "Oversight, audit & reporting",
  admin: "Manages users & settings",
};

export const ALL_ROLES: UserRole[] = ["teaching_assistant", "teacher", "qtvi", "senco", "admin"];
