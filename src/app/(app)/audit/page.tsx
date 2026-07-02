import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { getAudit } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { formatRelative, initials } from "@/lib/utils";

const ACTION_LABEL: Record<string, string> = {
  "task.create": "created a task",
  "upload.create": "uploaded a file",
  "ai.braille_ocr.run": "ran AI/OCR Braille draft on",
  "ai.visual_description.run": "ran AI visual description on",
  "ai.stem_description.run": "ran AI STEM description on",
  "transcription.draft": "ran transcription on",
  "transcription.edit": "edited",
  "transcription.specialist_verify": "specialist verified",
  "feedback.generate": "generated feedback for",
  "feedback.edit": "edited feedback for",
  "feedback.approve": "approved feedback for",
  "visual.draft": "drafted a description for",
  "visual.edit": "edited",
  "visual.context.edit": "updated assessment context for",
  "visual.approve": "approved",
  "stem.draft": "drafted a STEM description for",
  "stem.restyle": "restyled",
  "stem.edit": "edited",
  "stem.approve": "approved",
  "task.reject": "rejected",
  "task.archive": "archived",
  "export.preview": "opened print preview for",
  "export.completed": "exported",
  "data.delete": "secure-deleted",
  "user.role_change": "changed the role of",
  "staff.role_update": "changed the role of",
  "staff.braille_literate_update": "updated Braille-literate status for",
  "settings.retention": "updated retention",
  "eval.sample": "added an evaluation sample",
  "eval.sample.delete": "deleted an evaluation sample",
  "eval.run": "ran an evaluation",
};

export default function AuditPage() {
  const user = requireUser();
  if (!can(user.role, "audit.read")) redirect("/dashboard");

  const entries = getAudit();

  return (
    <>
      <PageHeader
        title="Audit Trail"
        description="Every upload, edit, verification and approval is recorded — the compliance backbone."
      />

      <Card>
        {entries.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <ScrollText className="mx-auto h-8 w-8 text-zinc-300" />
            <p className="mt-3 text-sm text-zinc-500">No activity recorded yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3.5 px-5 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-500">
                  {initials(e.actorName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-700">
                    <span className="font-medium text-zinc-900">{e.actorName}</span>{" "}
                    {ACTION_LABEL[e.action] ?? e.action}{" "}
                    <span className="font-medium text-zinc-900">{e.objectLabel}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {e.objectType}
                    {e.previousStatus && e.newStatus ? ` - ${e.previousStatus} to ${e.newStatus}` : ""}
                    {e.reason ? ` - ${e.reason}` : ""}
                    {e.provider ? ` - ${e.aiMode ?? "?"}/${e.provider}${e.model ? `/${e.model}` : ""}${e.confidence != null ? ` ${Math.round(e.confidence * 100)}%` : ""}` : ""}
                    {e.promptVersion ? ` · ${e.promptVersion}` : ""}
                    {e.flagSummary && e.flagSummary.length > 0 ? ` · flags: ${e.flagSummary.join(", ")}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-zinc-400">{formatRelative(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
