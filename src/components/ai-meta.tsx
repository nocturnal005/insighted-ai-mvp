import { Bot, Cpu, Gauge, ShieldQuestion, Timer, Flag, AlertOctagon } from "lucide-react";

/**
 * Compact provenance strip shown wherever AI/OCR output appears: mode badge, provider,
 * model, confidence, processing time, prompt version, and flag count. Values are optional
 * so pre-existing records (created before the provider layer) render cleanly. Presentation
 * only — no secrets ever reach here.
 */
export interface AiMetaProps {
  mode?: "mock" | "real" | null;
  provider?: string | null;
  model?: string | null;
  confidence?: number | null;
  promptVersion?: string | null;
  processingMs?: number | null;
  flagCount?: number | null;
  /** True when the last run fell back (provider unavailable / processing failed). */
  unavailable?: boolean;
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

export function AiMeta({ mode, provider, model, confidence, promptVersion, processingMs, flagCount, unavailable }: AiMetaProps) {
  if (!mode && !provider && !model && confidence == null && processingMs == null) return null;

  const badge = unavailable
    ? { label: "Provider unavailable", cls: "bg-critical-50 text-critical-700", Icon: AlertOctagon }
    : mode === "real"
      ? { label: "Real provider", cls: "bg-accent-50 text-accent-700", Icon: Bot }
      : { label: "Mock demo", cls: "bg-zinc-100 text-zinc-600", Icon: Bot };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium ${badge.cls}`} title="AI mode">
        <badge.Icon className="h-3.5 w-3.5" /> {badge.label}
      </span>
      {provider && (
        <span className="inline-flex items-center gap-1.5" title="Provider">
          <ShieldQuestion className="h-3.5 w-3.5" /> {provider}
        </span>
      )}
      {model && (
        <span className="inline-flex items-center gap-1.5" title="Model">
          <Cpu className="h-3.5 w-3.5" /> {model}
        </span>
      )}
      {confidence != null && (
        <span className="inline-flex items-center gap-1.5" title="Model-reported confidence">
          <Gauge className="h-3.5 w-3.5" /> {Math.round(confidence * 100)}% confidence
        </span>
      )}
      {processingMs != null && processingMs > 0 && (
        <span className="inline-flex items-center gap-1.5" title="Processing time">
          <Timer className="h-3.5 w-3.5" /> {formatMs(processingMs)}
        </span>
      )}
      {flagCount != null && flagCount > 0 && (
        <span className="inline-flex items-center gap-1.5" title="Uncertainty flags">
          <Flag className="h-3.5 w-3.5" /> {flagCount} flag{flagCount === 1 ? "" : "s"}
        </span>
      )}
      {promptVersion && <span className="text-zinc-400">· {promptVersion}</span>}
    </div>
  );
}
