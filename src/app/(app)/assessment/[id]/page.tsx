import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getVisualTask, getTaskAudit, getTaskUpload } from "@/lib/data";
import { hydrateVisualTask } from "@/lib/durable-demo";
import { pupilLabel, userName } from "@/lib/store";
import { sourcePreviewDataUrl } from "@/lib/source-preview";
import { can } from "@/lib/rbac";
import { assessmentContextLabel } from "@/lib/assessment-context";
import { TaskBadge } from "@/components/ui/badge";
import { TaskTimeline } from "@/components/task-timeline";
import { formatRelative } from "@/lib/utils";
import { VisualWorkflow } from "./visual-workflow";

export default async function VisualDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  const task =
    (await hydrateVisualTask(params.id, { includeUploadData: true })) ??
    getVisualTask(params.id);
  if (!task) notFound();

  const up = getTaskUpload(task.id);
  const timeline = getTaskAudit(task.id);
  const sourceDataUrl = up ? await sourcePreviewDataUrl(up) : "";
  const upload = up
    ? {
        // Vercel functions do not share this demo's in-memory uploads. Inline only a
        // compressed preview so the source remains available without the original
        // multi-megabyte React payload.
        src: sourceDataUrl,
        fileName: up.fileName,
        fileType: up.fileType,
        uploaderName: userName(up.uploadedBy),
        createdAt: up.createdAt,
      }
    : null;

  return (
    <div className="max-w-3xl">
      <Link href="/assessment" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-zinc-900">{task.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {task.subject ?? "No subject"} · {assessmentContextLabel(task.context)}
            {pupilLabel(task.pupilId) ? ` · ${pupilLabel(task.pupilId)}` : ""} · updated {formatRelative(task.updatedAt)}
          </p>
        </div>
        <TaskBadge status={task.status} />
      </div>

      <VisualWorkflow
        task={task}
        upload={upload}
        permissions={{
          canApprove: can(user.role, "visual.approve"),
          canEdit: can(user.role, "description.edit"),
          canReject: can(user.role, "task.reject"),
          canExport: can(user.role, "export"),
        }}
      />
      <div className="mt-5">
        <TaskTimeline entries={timeline} />
      </div>
    </div>
  );
}
