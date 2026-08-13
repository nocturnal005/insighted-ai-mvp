import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getBrailleTask, getTaskAudit, getTaskUpload } from "@/lib/data";
import { pupilLabel, userName } from "@/lib/store";
import { can } from "@/lib/rbac";
import { TaskBadge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import {
  isPrivateProviderIdentity,
  redactPrivateAuditProvenance,
  redactPrivateBrailleProvenance,
} from "@/lib/ai/provider-visibility";
import { ReviewWorkflow } from "./review-workflow";
import { hydrateBrailleTask } from "@/lib/durable-braille";

export default async function BrailleDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  const task = (await hydrateBrailleTask(params.id)) ?? getBrailleTask(params.id);
  if (!task) notFound();

  const up = getTaskUpload(task.id);
  const timeline = redactPrivateAuditProvenance(getTaskAudit(task.id));
  const privateProvenance = isPrivateProviderIdentity(task.transcription?.aiProvider);
  const canViewSourceEvidence = can(user.role, "transcription.specialist_verify", {
    brailleLiterate: user.brailleLiterate,
  });
  const taskForDisplay = redactPrivateBrailleProvenance(task, {
    includeSourceEvidence: canViewSourceEvidence,
  });
  const upload = up
    ? {
        src: `/api/source/${encodeURIComponent(task.id)}?preview=1`,
        fileName: up.fileName,
        fileType: up.fileType,
        uploaderName: userName(up.uploadedBy),
        createdAt: up.createdAt,
      }
    : null;
  const learner = pupilLabel(task.pupilId) ?? "No learner linked";
  const workflowStage = !task.transcription
    ? "Stage 1 of 3 · Upload & Translate"
    : task.transcription.status !== "specialist_verified"
      ? "Stage 2 of 3 · Verify & Review"
      : "Stage 3 of 3 · Assess & Feedback";

  return (
    <div className="mx-auto max-w-[1500px]">
      <Link href="/braille" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Back to submissions
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-5">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-tight text-zinc-900">{task.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {task.subject ?? "No subject"} · {learner} · updated {formatRelative(task.updatedAt)}
          </p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-accent-700">{workflowStage}</p>
        </div>
        <TaskBadge status={task.status} />
      </div>

      <ReviewWorkflow
        task={taskForDisplay}
        upload={upload}
        timeline={timeline}
        summary={{
          learner,
          subject: task.subject ?? "No subject",
          assignment: task.title,
          document: upload?.fileName ?? null,
          uploadedBy: upload?.uploaderName ?? null,
          uploadedAt: upload ? formatRelative(upload.createdAt) : null,
          updated: formatRelative(task.updatedAt),
        }}
        privateProvenance={privateProvenance}
        permissions={{
          canEdit: can(user.role, "transcription.edit"),
          canVerify: canViewSourceEvidence,
          canFeedback: can(user.role, "feedback.generate"),
          canApproveFeedback: can(user.role, "feedback.approve"),
          canReject: can(user.role, "task.reject"),
          canArchive: can(user.role, "task.archive"),
          canExport: can(user.role, "export"),
        }}
      />
    </div>
  );
}
