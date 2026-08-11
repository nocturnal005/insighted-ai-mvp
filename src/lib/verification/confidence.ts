import type { BrailleOcrResult, UncertaintyFlag } from "@/lib/ai/types";
import type {
  TranscriptionConfidenceEvidence,
  TranscriptionReviewItem,
} from "@/lib/types";

const NON_CONTEXTUAL_CATEGORIES = new Set([
  "requires_specialist_review",
  "provider_unavailable",
  "processing_failed",
  "pdf_processing_pending",
  "real_pupil_data_blocked",
  "secondary_review_unavailable",
]);

export const UNAVAILABLE_CONFIDENCE: TranscriptionConfidenceEvidence = {
  availability: "unavailable",
  value: null,
  kind: "unavailable",
  granularity: "document",
  source: "Provider did not supply usable confidence evidence",
  meaning: "No calibrated numeric confidence is available for this transcription.",
  providerSupplied: false,
};

export function storedConfidenceEvidence(result: BrailleOcrResult): TranscriptionConfidenceEvidence {
  const evidence = result.confidenceEvidence;
  if (!evidence || evidence.availability !== "available" || evidence.value === null) {
    return evidence ?? UNAVAILABLE_CONFIDENCE;
  }
  return {
    ...evidence,
    value: Math.min(1, Math.max(0, evidence.value)),
  };
}

function exactUniqueRange(text: string, excerpt: string): { start: number; end: number } | null {
  const candidate = excerpt.trim();
  if (!candidate) return null;
  const start = text.indexOf(candidate);
  if (start < 0 || text.indexOf(candidate, start + candidate.length) >= 0) return null;
  return { start, end: start + candidate.length };
}

function lineRange(text: string, lineNumber: number | null, excerpt: string) {
  if (!lineNumber || lineNumber < 1) return exactUniqueRange(text, excerpt);
  const lines = text.split("\n");
  if (lineNumber > lines.length) return null;
  const lineStart = lines.slice(0, lineNumber - 1).reduce((total, line) => total + line.length + 1, 0);
  const local = lines[lineNumber - 1].indexOf(excerpt.trim());
  if (local < 0 || lines[lineNumber - 1].indexOf(excerpt.trim(), local + excerpt.trim().length) >= 0) {
    return exactUniqueRange(text, excerpt);
  }
  return { start: lineStart + local, end: lineStart + local + excerpt.trim().length };
}

function itemFromFlag(
  result: BrailleOcrResult,
  flag: UncertaintyFlag,
  index: number,
): TranscriptionReviewItem | null {
  if (NON_CONTEXTUAL_CATEGORIES.has(flag.category)) return null;
  const range = exactUniqueRange(result.draftText, flag.text);
  if (!range) return null;
  const evidenceSource = result.meta.provider === "external_braille_ocr"
    ? "ocr_provider_flag"
    : "general_vision_flag";
  return {
    id: `review-${range.start}-${range.end}-${index}`,
    ...range,
    machineText: result.draftText.slice(range.start, range.end),
    reviewedText: result.draftText.slice(range.start, range.end),
    uncertaintyState: flag.severity === "high" ? "review_required" : "review_suggested",
    reviewStatus: "unreviewed",
    category: flag.category,
    severity: flag.severity,
    reason: flag.reason,
    evidenceSource,
    confidence: null,
    confidenceSource: null,
    alternativeText: null,
    reviewerNote: "",
    reviewedBy: null,
    reviewedAt: null,
  };
}

/** Build only items whose evidence maps unambiguously to an exact visible excerpt. */
export function buildTranscriptionReviewItems(result: BrailleOcrResult): TranscriptionReviewItem[] {
  const candidates: TranscriptionReviewItem[] = result.flags
    .map((flag, index) => itemFromFlag(result, flag, index))
    .filter((item): item is TranscriptionReviewItem => Boolean(item));

  for (const [index, discrepancy] of (result.review?.discrepancies ?? []).entries()) {
    const range = lineRange(result.draftText, discrepancy.lineNumber, discrepancy.sourceText);
    if (!range) continue;
    candidates.push({
      id: `review-${range.start}-${range.end}-secondary-${index}`,
      ...range,
      machineText: result.draftText.slice(range.start, range.end),
      reviewedText: result.draftText.slice(range.start, range.end),
      uncertaintyState: discrepancy.severity === "high" ? "review_required" : "review_suggested",
      reviewStatus: "unreviewed",
      category: discrepancy.issueType,
      severity: discrepancy.severity,
      reason: discrepancy.reason,
      evidenceSource: "secondary_ai_review",
      // A general-purpose model's self-reported number is deliberately not OCR confidence.
      confidence: null,
      confidenceSource: null,
      alternativeText: discrepancy.suggestedText,
      reviewerNote: "",
      reviewedBy: null,
      reviewedAt: null,
    });
  }

  const occupied: Array<{ start: number; end: number }> = [];
  return candidates
    .sort((a, b) => a.start - b.start || (a.severity === "high" ? -1 : 1))
    .filter((item) => {
      if (occupied.some((range) => item.start < range.end && item.end > range.start)) return false;
      occupied.push({ start: item.start, end: item.end });
      return true;
    })
    .map((item, index) => ({ ...item, id: `review-${item.start}-${item.end}-${index}` }));
}

export function unresolvedRequiredReviewItems(items: TranscriptionReviewItem[] | null | undefined) {
  return (items ?? []).filter(
    (item) =>
      item.reviewStatus === "needs_rescan" ||
      (item.uncertaintyState === "review_required" && item.reviewStatus === "unreviewed"),
  );
}
