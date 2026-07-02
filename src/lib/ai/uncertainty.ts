/**
 * Uncertainty-flag helpers.
 *
 * A single `UncertaintyFlag` type spans Braille OCR quality, image quality, provider
 * failures, and assessment answer-leak risk. These helpers build flags consistently and
 * map them onto the app's existing `LowConfidenceRegion[]` / `AnswerSensitiveFlag[]`
 * shapes so the current UI keeps working without a rewrite.
 */
import type { AnswerSensitiveFlag, LowConfidenceRegion, StoredAiFlag } from "@/lib/types";
import type {
  UncertaintyCategory,
  UncertaintyFlag,
  UncertaintySeverity,
} from "./types";

function trim(value: string, max = 300): string {
  const s = value.trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

let flagCounter = 0;
function flagId(): string {
  flagCounter += 1;
  return `flag_${Date.now().toString(36)}${flagCounter}`;
}

export function makeFlag(params: {
  text: string;
  reason: string;
  category: UncertaintyCategory;
  severity?: UncertaintySeverity;
  suggestedAction?: string;
  bbox?: UncertaintyFlag["bbox"];
}): UncertaintyFlag {
  return {
    id: flagId(),
    text: params.text,
    reason: params.reason,
    category: params.category,
    severity: params.severity ?? "medium",
    suggestedAction: params.suggestedAction,
    bbox: params.bbox,
  };
}

/** Standard flag when a provider is not configured/available. Always high severity. */
export function providerUnavailableFlag(providerLabel: string): UncertaintyFlag {
  return makeFlag({
    text: "Provider unavailable",
    reason: `${providerLabel} is not configured. Returned a controlled placeholder instead of AI output.`,
    category: "provider_unavailable",
    severity: "high",
    suggestedAction: "Configure the provider or use mock mode, then re-run.",
  });
}

/** Standard flag when a provider call or response validation failed. High severity. */
export function processingFailedFlag(detail?: string): UncertaintyFlag {
  return makeFlag({
    text: "Processing failed",
    reason:
      "The AI/OCR run could not be completed" +
      (detail ? ` (${detail}).` : ".") +
      " No text was produced; treat this task as not yet processed.",
    category: "processing_failed",
    severity: "high",
    suggestedAction: "Re-run once the provider is reachable, or verify manually.",
  });
}

/** Standard flag for the specialist-verification requirement on Braille output. */
export function requiresSpecialistReviewFlag(): UncertaintyFlag {
  return makeFlag({
    text: "Specialist verification required",
    reason:
      "Braille transcription accuracy must be verified by a QTVI, Admin, or explicitly " +
      "Braille-literate staff member before teacher feedback or export.",
    category: "requires_specialist_review",
    severity: "high",
    suggestedAction: "Route to a specialist verifier.",
  });
}

/** High-severity flag when an assessment-context task lacks prompt/skill context. */
export function assessmentContextMissingFlag(): UncertaintyFlag {
  return makeFlag({
    text: "Assessment context missing",
    reason:
      "Assessment-safety cannot be fully determined without knowing what the question is testing.",
    category: "answer_leak_risk",
    severity: "high",
    suggestedAction: "Add the question prompt and the assessed skill, then re-run.",
  });
}

/**
 * High-severity flag when a pupil-linked task is blocked from reaching a real provider
 * because `ALLOW_REAL_PUPIL_DATA=false`. No file or context was sent to any provider.
 */
export function realPupilDataBlockedFlag(): UncertaintyFlag {
  return makeFlag({
    text: "Real-provider processing blocked",
    reason:
      "This task is linked to a pupil and real AI mode is enabled while ALLOW_REAL_PUPIL_DATA=false. " +
      "The app did not send the file or context to a real provider. Use mock mode, remove pupil linkage, " +
      "or obtain school data-protection approval before enabling real-provider processing.",
    category: "real_pupil_data_blocked",
    severity: "high",
    suggestedAction:
      "Use mock mode, unlink the pupil, or set ALLOW_REAL_PUPIL_DATA=true only after data-protection approval.",
  });
}

/** Flag for PDFs that were stored but not yet rasterised for OCR. High severity. */
export function pdfPendingFlag(): UncertaintyFlag {
  return makeFlag({
    text: "PDF OCR pending",
    reason:
      "PDF rasterisation for OCR is not yet available in this build. The file is stored, " +
      "but no page image was processed.",
    category: "pdf_processing_pending",
    severity: "high",
    suggestedAction: "Upload a PNG/JPG of the page, or wait for PDF rasterisation support.",
  });
}

const HIGH_PRIORITY: UncertaintyCategory[] = [
  "real_pupil_data_blocked",
  "provider_unavailable",
  "processing_failed",
  "pdf_processing_pending",
  "requires_specialist_review",
  "low_image_quality",
];

/**
 * Maps Braille/image uncertainty flags to the existing `LowConfidenceRegion[]` shape the
 * transcription UI renders. High-priority flags (provider/processing/PDF) are always
 * preserved and surfaced first, so they can never be silently dropped.
 */
export function mapFlagsToLowConfidenceRegions(flags: UncertaintyFlag[]): LowConfidenceRegion[] {
  const highPriority = flags.filter((f) => HIGH_PRIORITY.includes(f.category) || f.severity === "high");
  const rest = flags.filter((f) => !highPriority.includes(f));
  return [...highPriority, ...rest].map((f) => ({
    text: f.text,
    reason: f.severity === "high" ? `[${f.severity.toUpperCase()}] ${f.reason}` : f.reason,
  }));
}

const ANSWER_SENSITIVE_TYPES: Record<string, AnswerSensitiveFlag["type"]> = {
  trend_revealed: "trend_revealed",
  comparison_revealed: "comparison_revealed",
  answer_value_revealed: "answer_value_revealed",
  label_reveals_answer: "label_reveals_answer",
  visual_emphasis_reveals_answer: "visual_emphasis_reveals_answer",
  relationship_interpreted: "relationship_interpreted",
  cause_effect_implied: "cause_effect_implied",
  unnecessary_clue: "unnecessary_clue",
};

/**
 * Maps answer-risk uncertainty flags to the existing `AnswerSensitiveFlag[]` shape used
 * by the Assessment-Safe and STEM UIs. Provider/processing/assessment-context flags are
 * always kept so critical warnings survive the mapping.
 */
export function mapFlagsToAnswerSensitiveFlags(flags: UncertaintyFlag[]): AnswerSensitiveFlag[] {
  return flags.map((f) => ({
    text: f.text,
    reason: f.severity === "high" ? `[${f.severity.toUpperCase()}] ${f.reason}` : f.reason,
    type: ANSWER_SENSITIVE_TYPES[f.category],
  }));
}

/**
 * Concise, de-duplicated `severity: category` summaries for audit/eval records, e.g.
 * `high: requires_specialist_review`. Never contains free text, secrets, or payloads.
 * Capped so a noisy run cannot bloat an audit entry.
 */
export function summariseFlags(flags: UncertaintyFlag[], limit = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of flags) {
    const key = `${f.severity}: ${f.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Convert provider uncertainty flags to the durable `StoredAiFlag[]` shape kept on task and
 * eval records. Text/reason are trimmed so an overlong provider flag cannot bloat storage
 * or the UI. Preserves severity + category that the simpler UI flag shapes drop.
 */
export function toStoredFlags(flags: UncertaintyFlag[], limit = 20): StoredAiFlag[] {
  return flags.slice(0, limit).map((f) => ({
    text: trim(f.text),
    reason: trim(f.reason),
    category: f.category,
    severity: f.severity,
  }));
}
