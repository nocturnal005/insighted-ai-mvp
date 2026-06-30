import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getVisualTask, getTaskUpload } from "@/lib/data";
import { pupilLabel, userName } from "@/lib/store";
import { can } from "@/lib/rbac";
import { TaskBadge } from "@/components/ui/badge";
import { formatRelative } from "@/lib/utils";
import { VisualWorkflow } from "./visual-workflow";

export default function VisualDetailPage({ params }: { params: { id: string } }) {
  const user = requireUser();
  const task = getVisualTask(params.id);
  if (!task) notFound();

  const up = getTaskUpload(task.id);
  const upload = up
    ? { dataUrl: up.dataUrl, fileName: up.fileName, uploaderName: userName(up.uploadedBy), createdAt: up.createdAt }
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
            {task.subject ?? "No subject"} · {task.context === "assessment" ? "Assessment use" : "Lesson use"}
            {pupilLabel(task.pupilId) ? ` · ${pupilLabel(task.pupilId)}` : ""} · updated {formatRelative(task.updatedAt)}
          </p>
        </div>
        <TaskBadge status={task.status} />
      </div>

      <VisualWorkflow
        task={task}
        upload={upload}
        permissions={{
          canEdit: can(user.role, "description.edit"),
          canApprove: can(user.role, "visual.approve"),
          canReject: can(user.role, "task.reject"),
          canExport: can(user.role, "export"),
        }}
      />
    </div>
  );
}
