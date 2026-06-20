import { cn } from "@/lib/utils";
import type { ApprovalStatus, TaskStatus, TranscriptionStatus } from "@/lib/types";

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

const TASK: Record<TaskStatus, { c: string; label: string }> = {
  draft: { c: "bg-zinc-100 text-zinc-600", label: "Draft" },
  needs_review: { c: "bg-caution-50 text-caution-700", label: "Needs review" },
  approved: { c: "bg-positive-50 text-positive-700", label: "Approved" },
  rejected: { c: "bg-critical-50 text-critical-700", label: "Rejected" },
  archived: { c: "bg-zinc-100 text-zinc-500", label: "Archived" },
};

export function TaskBadge({ status }: { status: TaskStatus }) {
  const s = TASK[status];
  return <Pill className={s.c}>{s.label}</Pill>;
}

const TRANSCRIPTION: Record<TranscriptionStatus, { c: string; label: string }> = {
  draft: { c: "bg-caution-50 text-caution-700", label: "AI draft" },
  verified: { c: "bg-positive-50 text-positive-700", label: "Verified" },
};

export function TranscriptionBadge({ status }: { status: TranscriptionStatus }) {
  const s = TRANSCRIPTION[status];
  return <Pill className={s.c}>{s.label}</Pill>;
}

const APPROVAL: Record<ApprovalStatus, { c: string; label: string }> = {
  draft: { c: "bg-caution-50 text-caution-700", label: "Draft" },
  approved: { c: "bg-positive-50 text-positive-700", label: "Approved" },
};

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const s = APPROVAL[status];
  return <Pill className={s.c}>{s.label}</Pill>;
}
