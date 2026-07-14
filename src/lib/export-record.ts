import { getBrailleTask, getStemTask, getVisualTask } from "@/lib/data";
import { recordAudit } from "@/lib/store";
import { hydrateBrailleTask, persistBrailleTask } from "@/lib/durable-braille";
import type { ExportKind } from "@/lib/export-content";
import type { User } from "@/lib/types";

/** Stamp a record as exported and write the audit entry. Idempotent enough for a demo. */
export async function markExported(kind: ExportKind, id: string, user: User, title: string, completed = true): Promise<void> {
  const at = new Date().toISOString();
  let durableBrailleTask = null;
  if (completed) {
    if (kind === "transcription" || kind === "feedback") {
      const t = (await hydrateBrailleTask(id)) ?? getBrailleTask(id);
      if (t) t.exportedAt = at;
      durableBrailleTask = t ?? null;
    } else if (kind === "visual") {
      const v = getVisualTask(id);
      if (v) v.exportedAt = at;
    } else if (kind === "stem") {
      const s = getStemTask(id);
      if (s) s.exportedAt = at;
    }
  }

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

  if (kind === "transcription" || kind === "feedback") {
    durableBrailleTask ??= (await hydrateBrailleTask(id)) ?? getBrailleTask(id) ?? null;
    if (durableBrailleTask) await persistBrailleTask(durableBrailleTask);
  }
}
