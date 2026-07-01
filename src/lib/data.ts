import { db } from "@/lib/store";
import type { BrailleTask, Pupil, StemTask, VisualDescriptionTask } from "@/lib/types";

/** Read helpers. All scoped to the demo organisation. */

export function getBrailleTasks(): BrailleTask[] {
  return [...db.brailleTasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function getBrailleTask(taskId: string): BrailleTask | undefined {
  return db.brailleTasks.find((t) => t.id === taskId);
}

export function getVisualTasks(): VisualDescriptionTask[] {
  return [...db.visualTasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function getVisualTask(taskId: string): VisualDescriptionTask | undefined {
  return db.visualTasks.find((t) => t.id === taskId);
}

export function getStemTasks(): StemTask[] {
  return [...db.stemTasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function getStemTask(taskId: string): StemTask | undefined {
  return db.stemTasks.find((t) => t.id === taskId);
}

/** The tracked Upload record for a task (latest first), or undefined. */
export function getTaskUpload(taskId: string) {
  return [...db.uploads].reverse().find((u) => u.taskId === taskId);
}

export function getCorrections() {
  return db.corrections;
}
export function getEvalSamples() {
  return db.evalSamples;
}

export interface QualityStats {
  pairs: number;
  avgCer: number | null;
  avgWer: number | null;
  samples: number;
  evaluated: number;
  evalAvgCer: number | null;
}

/** Aggregate OCR quality: correction burden (from the verify loop) + harness accuracy. */
export function getQualityStats(): QualityStats {
  const c = db.corrections;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const run = db.evalSamples.filter((s) => s.cer !== null);
  return {
    pairs: c.length,
    avgCer: avg(c.map((x) => x.cer)),
    avgWer: avg(c.map((x) => x.wer)),
    samples: db.evalSamples.length,
    evaluated: run.length,
    evalAvgCer: avg(run.map((s) => s.cer as number)),
  };
}

export function getAudit() {
  return db.audit;
}
export function getTaskAudit(taskId: string) {
  return db.audit.filter((entry) => entry.taskId === taskId);
}
export function getPupils(): Pupil[] {
  return db.pupils;
}
export function getPupil(pupilId: string): Pupil | undefined {
  return db.pupils.find((p) => p.id === pupilId);
}
export function getUsers() {
  return db.users;
}
export function getSettings() {
  return db.settings;
}

/** All work linked to one pupil, across modules. */
export function getPupilWork(pupilId: string) {
  return {
    braille: db.brailleTasks.filter((t) => t.pupilId === pupilId),
    visual: db.visualTasks.filter((t) => t.pupilId === pupilId),
    stem: db.stemTasks.filter((t) => t.pupilId === pupilId),
  };
}

export interface ApprovalItem {
  id: string;
  kind: "braille" | "visual" | "stem";
  title: string;
  href: string;
  context: string;
}

/** Everything currently awaiting human review/approval, across all modules. */
export function getApprovalQueue(): ApprovalItem[] {
  const items: ApprovalItem[] = [];
  for (const t of db.brailleTasks) {
    if (t.status === "needs_specialist_review") {
      items.push({ id: t.id, kind: "braille", title: t.title, href: `/braille/${t.id}`, context: "Specialist Braille verification" });
    } else if (t.status === "teacher_review") {
      items.push({ id: t.id, kind: "braille", title: t.title, href: `/braille/${t.id}`, context: "Teacher feedback approval" });
    }
  }
  for (const t of db.visualTasks) {
    if (t.status === "draft" || t.status === "needs_review") {
      items.push({ id: t.id, kind: "visual", title: t.title, href: `/assessment/${t.id}`, context: "Assessment-safe description" });
    }
  }
  for (const t of db.stemTasks) {
    if (t.status === "draft" || t.status === "needs_review") {
      items.push({ id: t.id, kind: "stem", title: t.title, href: `/stem/${t.id}`, context: "STEM description" });
    }
  }
  return items;
}

export interface DashboardStats {
  active: number;
  awaitingReview: number;
  approved: number;
  rejected: number;
  recent: BrailleTask[];
}

export function getDashboardStats(): DashboardStats {
  const tasks = getBrailleTasks();
  const all = [...db.brailleTasks, ...db.visualTasks, ...db.stemTasks];
  return {
    active: all.filter((t) => t.status !== "archived" && t.status !== "rejected").length,
    awaitingReview: getApprovalQueue().length,
    approved: all.filter((t) => t.status === "approved").length,
    rejected: all.filter((t) => t.status === "rejected").length,
    recent: tasks.slice(0, 6),
  };
}
