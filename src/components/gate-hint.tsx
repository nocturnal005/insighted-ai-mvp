import { Lock } from "lucide-react";

/**
 * Small demo-clarity hint that explains why export is not yet available. Kept intentionally
 * minimal — it sits alongside the action buttons in a workflow's pre-approval state so a
 * presenter (and staff) can see at a glance that the export gate is intentional.
 */
export function ExportGateHint({ message, className = "" }: { message: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-zinc-400 ${className}`} title={message}>
      <Lock className="h-3.5 w-3.5" /> {message}
    </span>
  );
}
