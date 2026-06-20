import { getBrailleTask, getStemTask, getVisualTask } from "@/lib/data";
import { recordAudit } from "@/lib/store";
import type { ExportKind } from "@/lib/export-content";
import type { User } from "@/lib/types";

/** Stamp a record as exported and write the audit entry. Idempotent enough for a demo. */
export function markExported(kind: ExportKind, id: string, user: User, title: string): void {
  const at = new Date().toISOString();
  if (kind === "transcription" || kind === "feedback") {
    const t = getBrailleTask(id);
    if (t) t.exportedAt = at;
  } else if (kind === "visual") {
    const v = getVisualTask(id);
    if (v) v.exportedAt = at;
  } else if (kind === "stem") {
    const s = getStemTask(id);
    if (s) s.exportedAt = at;
  }

  const objectType =
    kind === "transcription" ? "Braille transcription"
    : kind === "feedback" ? "Feedback report"
    : kind === "visual" ? "Visual description"
    : "STEM description";

  recordAudit({ actorId: user.id, actorName: user.fullName, action: "export", objectType, objectLabel: title });
}
