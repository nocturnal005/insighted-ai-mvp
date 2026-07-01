/**
 * Processing-metadata helpers. Every provider run is timed and stamped with provider,
 * model, engine/prompt versions, and mode so the product layer and audit trail can record
 * exactly what produced a given draft.
 */
import type { AiMode, AiProcessingMeta } from "./types";

export interface RunTimer {
  startedAt: string;
  start: number;
}

export function startRun(): RunTimer {
  return { startedAt: new Date().toISOString(), start: Date.now() };
}

export function finishMeta(
  timer: RunTimer,
  fields: { provider: string; model: string; engineVersion: string; promptVersion: string; mode: AiMode },
): AiProcessingMeta {
  const completed = Date.now();
  return {
    provider: fields.provider,
    model: fields.model,
    engineVersion: fields.engineVersion,
    promptVersion: fields.promptVersion,
    mode: fields.mode,
    startedAt: timer.startedAt,
    completedAt: new Date(completed).toISOString(),
    processingMs: Math.max(0, completed - timer.start),
  };
}
