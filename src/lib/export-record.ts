import { getBrailleTask, getStemTask, getVisualTask } from "@/lib/data";
import { recordAudit } from "@/lib/store";
import { hydrateBrailleTask, persistBrailleTask } from "@/lib/durable-braille";
import {
  hydrateStemTask,
  hydrateVisualTask,
  persistStemTask,
  persistVisualTask,
} from "@/lib/durable-demo";
import type { ExportKind } from "@/lib/export-content";
import type { User } from "@/lib/types";

/** Stamp a record as exported and write the audit entry. Idempotent enough for a demo. */
export async function markExported(kind: ExportKind, id: string, user: User, title: string, completed = true): Promise<void> {
  const at = new Date().toISOString();
  const objectType =
    kind === "transcription" ? "Braille transcription"
    : kind === "feedback" ? "Feedback report"
    : kind === "visual" ? "Visual description"
    : "STEM description";

  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: completed ? "export.completed" : "export.preview",
    objectType,
    objectLabel: title,
    taskId: id,
  });

  // Exporting must never leave a print preview or downloaded file waiting on the database.
  // The audit is already recorded in the live store; durable synchronisation continues in the
  // background and will be retried by the next update if the connection is unavailable.
  void syncExportRecord(kind, id, at, completed).catch(() => undefined);
}

async function syncExportRecord(
  kind: ExportKind,
  id: string,
  at: string,
  completed: boolean,
): Promise<void> {
  if (kind === "transcription" || kind === "feedback") {
    const task = (await hydrateBrailleTask(id)) ?? getBrailleTask(id);
    if (!task) return;
    if (completed) task.exportedAt = at;
    await persistBrailleTask(task);
    return;
  }

  if (kind === "visual") {
    const task = (await hydrateVisualTask(id)) ?? getVisualTask(id);
    if (!task) return;
    if (completed) task.exportedAt = at;
    await persistVisualTask(task);
    return;
  }

  const task = (await hydrateStemTask(id)) ?? getStemTask(id);
  if (!task) return;
  if (completed) task.exportedAt = at;
  await persistStemTask(task);
}
