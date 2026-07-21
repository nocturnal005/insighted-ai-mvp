import { CheckCircle2, Clock3 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/utils";
import { staffLabel } from "@/lib/rbac";
import { isPrivateProviderIdentity } from "@/lib/ai/provider-visibility";
import type { AuditEntry } from "@/lib/types";

const ACTION_LABEL: Record<string, string> = {
  "task.create": "Task created",
  "upload.create": "File uploaded",
  "ai.braille_ocr.run": "AI/OCR Braille draft generated",
  "ai.visual_description.run": "AI visual description generated",
  "ai.stem_description.run": "AI STEM description generated",
  "transcription.draft": "AI draft generated",
  "transcription.edit": "Transcription edited",
  "transcription.specialist_verify": "Specialist verification completed",
  "feedback.generate": "Teacher feedback drafted",
  "feedback.edit": "Feedback edited",
  "feedback.approve": "Teacher feedback approved",
  "visual.draft": "Visual description drafted",
  "visual.edit": "Visual description edited",
  "visual.context.edit": "Assessment context updated",
  "visual.approve": "Visual description approved",
  "stem.draft": "STEM description drafted",
  "stem.restyle": "STEM draft restyled",
  "stem.edit": "STEM description edited",
  "stem.approve": "STEM description approved",
  "export.preview": "Print preview opened",
  "export.completed": "Export completed",
  "task.reject": "Task rejected",
  "task.archive": "Task archived",
  "data.delete": "Data deleted",
};

export function TaskTimeline({ entries }: { entries: AuditEntry[] }) {
  const ordered = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Task timeline</CardTitle>
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
          <Clock3 className="h-3.5 w-3.5" /> Audit-backed activity
        </span>
      </CardHeader>
      <CardBody className="p-0">
        {ordered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-500">No task-specific audit entries yet.</p>
        ) : (
          <ol className="divide-y divide-zinc-100">
            {ordered.map((entry) => (
              <li key={entry.id} className="flex gap-3 px-5 py-3.5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-positive-50 text-positive-700">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900">{ACTION_LABEL[entry.action] ?? entry.action}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {staffLabel(entry.actorRole)}
                    {entry.previousStatus && entry.newStatus ? ` - ${entry.previousStatus} to ${entry.newStatus}` : ""}
                    {entry.reason ? ` - ${entry.reason}` : ""}
                  </p>
                  {entry.provider && (
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      {isPrivateProviderIdentity(entry.provider)
                        ? "Live transcription"
                        : `${entry.aiMode ?? "?"} · ${entry.provider}`}
                      {!isPrivateProviderIdentity(entry.provider) && entry.model ? `/${entry.model}` : ""}
                      {entry.confidence != null && !isPrivateProviderIdentity(entry.provider)
                        ? ` · ${Math.round(entry.confidence * 100)}% conf`
                        : ""}
                      {entry.processingMs != null ? ` · ${entry.processingMs}ms` : ""}
                      {!isPrivateProviderIdentity(entry.provider) && entry.promptVersion ? ` · ${entry.promptVersion}` : ""}
                    </p>
                  )}
                  {entry.flagSummary && entry.flagSummary.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-zinc-400">Flags: {entry.flagSummary.join(", ")}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-zinc-400">{formatRelative(entry.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
