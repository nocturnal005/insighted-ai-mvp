import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getBrailleTask, getTaskAudit, getTaskUpload } from "@/lib/data";
import { pupilLabel, uploadDataUrl, userName } from "@/lib/store";
import { can } from "@/lib/rbac";
import { TaskBadge } from "@/components/ui/badge";
import { TaskTimeline } from "@/components/task-timeline";
import { formatRelative } from "@/lib/utils";
import { ReviewWorkflow } from "./review-workflow";

export default function BrailleDetailPage({ params }: { params: { id: string } }) {
  const user = requireUser();
  const task = getBrailleTask(params.id);
  if (!task) notFound();

  const up = getTaskUpload(task.id);
  const timeline = getTaskAudit(task.id);
  const upload = up
    ? { dataUrl: uploadDataUrl(up), fileName: up.fileName, uploaderName: userName(up.uploadedBy), createdAt: up.createdAt }
    : null;

  return (
    <div className="max-w-3xl">
      <Link href="/braille" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Back to reviews
      </Link>

      <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-zinc-900">{task.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {task.subject ?? "No subject"}
            {pupilLabel(task.pupilId) ? ` · ${pupilLabel(task.pupilId)}` : ""} · updated {formatRelative(task.updatedAt)}
          </p>
        </div>
        <TaskBadge status={task.status} />
      </div>

      <ReviewWorkflow
        task={task}
        upload={upload}
        permissions={{
          canEdit: can(user.role, "transcription.edit"),
          canVerify: can(user.role, "transcription.specialist_verify", { brailleLiterate: user.brailleLiterate }),
          canFeedback: can(user.role, "feedback.generate"),
          canApproveFeedback: can(user.role, "feedback.approve"),
          canReject: can(user.role, "task.reject"),
          canArchive: can(user.role, "task.archive"),
          canExport: can(user.role, "export"),
        }}
      />
      <div className="mt-5">
        <TaskTimeline entries={timeline} />
      </div>
    </div>
  );
}
