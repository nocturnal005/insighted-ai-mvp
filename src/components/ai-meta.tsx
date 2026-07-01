import { Bot, Cpu, Gauge, ShieldQuestion } from "lucide-react";

/**
 * Compact provenance strip shown wherever AI/OCR output appears: AI mode, provider,
 * model, and confidence. Values are optional so pre-existing records (created before the
 * provider layer) render cleanly. This is presentation only — no secrets ever reach here.
 */
export interface AiMetaProps {
  mode?: "mock" | "real" | null;
  provider?: string | null;
  model?: string | null;
  confidence?: number | null;
  promptVersion?: string | null;
}

export function AiMeta({ mode, provider, model, confidence, promptVersion }: AiMetaProps) {
  if (!mode && !provider && !model && confidence == null) return null;
  const modeLabel = mode === "real" ? "Real AI" : mode === "mock" ? "Mock (demo)" : "—";
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
      <span
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium ${
          mode === "real" ? "bg-accent-50 text-accent-700" : "bg-zinc-100 text-zinc-600"
        }`}
        title="AI mode"
      >
        <Bot className="h-3.5 w-3.5" /> {modeLabel}
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
      {promptVersion && <span className="text-zinc-400">· {promptVersion}</span>}
    </div>
  );
}
