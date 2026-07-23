import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getStemTask, getTaskAudit, getTaskUpload } from "@/lib/data";
import { hydrateStemTask } from "@/lib/durable-demo";
import { pupilLabel, userName } from "@/lib/store";
import { sourcePreviewDataUrl } from "@/lib/source-preview";
import { can } from "@/lib/rbac";
import { VISUAL_TYPE_LABELS, STRUCTURE_TEMPLATES } from "@/lib/braille-engine";
import { TaskBadge } from "@/components/ui/badge";
import { TaskTimeline } from "@/components/task-timeline";
import { formatRelative } from "@/lib/utils";
import { StemWorkflow } from "./stem-workflow";

export default async function StemDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  const task =
    (await hydrateStemTask(params.id, { includeUploadData: true })) ??
    getStemTask(params.id);
  if (!task) notFound();

  const up = getTaskUpload(task.id);
  const timeline = getTaskAudit(task.id);
  const sourceDataUrl = up ? await sourcePreviewDataUrl(up) : "";
  const upload = up
    ? {
        // Assessment/STEM uploads can be process-local in the demo deployment, so
        // render a bounded preview from the same function that loaded the task.
        src: sourceDataUrl,
        fileName: up.fileName,
        fileType: up.fileType,
        uploaderName: userName(up.uploadedBy),
        createdAt: up.createdAt,
      }
    : null;

  return (
    <div className="max-w-3xl">
      <Link href="/stem" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-zinc-900">{task.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {VISUAL_TYPE_LABELS[task.visualType]} · {task.subject ?? "No subject"}
            {pupilLabel(task.pupilId) ? ` · ${pupilLabel(task.pupilId)}` : ""} · updated {formatRelative(task.updatedAt)}
          </p>
        </div>
        <TaskBadge status={task.status} />
      </div>

      <StemWorkflow
        task={task}
        upload={upload}
        structure={STRUCTURE_TEMPLATES[task.visualType]}
        permissions={{ canApprove: can(user.role, "stem.approve"), canEdit: can(user.role, "description.edit"), canExport: can(user.role, "export") }}
      />
      <div className="mt-5">
        <TaskTimeline entries={timeline} />
      </div>
    </div>
  );
}
