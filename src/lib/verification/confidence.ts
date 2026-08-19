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

/**
 * Review-item IDs are stable inside one run and cannot collide with the same offsets/index
 * from another run. Missing run identity preserves the historical pre-lineage ID shape.
 */
export function reviewItemIdForRun(
  transcriptionRunId: string | null | undefined,
  start: number,
  end: number,
  index: number,
): string {
  const runId = transcriptionRunId?.trim();
  return runId
    ? `review-${runId}-${start}-${end}-${index}`
    : `review-${start}-${end}-${index}`;
}

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
    : isStructuredSecondaryFlag(result, flag)
      ? "secondary_ai_review"
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

function isStructuredSecondaryFlag(result: BrailleOcrResult, flag: UncertaintyFlag): boolean {
  if (result.meta.provider !== "abc_openai_review") return false;
  return (result.review?.discrepancies ?? []).some((discrepancy) => {
    const sourceText = discrepancy.sourceText.trim();
    return Boolean(
      sourceText &&
      flag.text.includes(sourceText) &&
      flag.reason.includes(discrepancy.reason),
    );
  });
}

interface ReviewCandidate {
  item: TranscriptionReviewItem;
  sourcePriority: number;
  severityPriority: number;
  originalIndex: number;
}

const SOURCE_PRIORITY: Record<TranscriptionReviewItem["evidenceSource"], number> = {
  secondary_ai_review: 0,
  ocr_provider_flag: 2,
  general_vision_flag: 3,
};

const SEVERITY_PRIORITY: Record<TranscriptionReviewItem["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Build only items whose evidence maps unambiguously to an exact visible excerpt. */
export function buildTranscriptionReviewItems(
  result: BrailleOcrResult,
  transcriptionRunId?: string | null,
): TranscriptionReviewItem[] {
  const candidates: ReviewCandidate[] = result.flags
    .map((flag, index) => {
      const item = itemFromFlag(result, flag, index);
      return item
        ? {
            item,
            // A derived hybrid flag retains secondary provenance but ranks after the
            // richer structured discrepancy that carries issue type and alternative.
            sourcePriority: item.evidenceSource === "secondary_ai_review"
              ? 1
              : SOURCE_PRIORITY[item.evidenceSource],
            severityPriority: SEVERITY_PRIORITY[item.severity],
            originalIndex: index,
          }
        : null;
    })
    .filter((candidate): candidate is ReviewCandidate => Boolean(candidate));

  for (const [index, discrepancy] of (result.review?.discrepancies ?? []).entries()) {
    const range = lineRange(result.draftText, discrepancy.lineNumber, discrepancy.sourceText);
    if (!range) continue;
    const item: TranscriptionReviewItem = {
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
    };
    candidates.push({
      item,
      sourcePriority: SOURCE_PRIORITY.secondary_ai_review,
      severityPriority: SEVERITY_PRIORITY[item.severity],
      originalIndex: result.flags.length + index,
    });
  }

  const occupied: Array<{ start: number; end: number }> = [];
  return candidates
    .sort(
      (a, b) =>
        a.item.start - b.item.start ||
        a.sourcePriority - b.sourcePriority ||
        a.severityPriority - b.severityPriority ||
        a.originalIndex - b.originalIndex,
    )
    .filter((candidate) => {
      const item = candidate.item;
      if (occupied.some((range) => item.start < range.end && item.end > range.start)) return false;
      occupied.push({ start: item.start, end: item.end });
      return true;
    })
    .map(({ item }, index) => ({
      ...item,
      transcriptionRunId: transcriptionRunId ?? null,
      id: reviewItemIdForRun(transcriptionRunId, item.start, item.end, index),
    }));
}

/** Preserve substantive high-priority reasons that cannot be attached to a safe range. */
export function buildUnmappedHighPriorityIssues(result: BrailleOcrResult): string[] {
  const reasons: string[] = [];
  for (const flag of result.flags) {
    if (
      flag.severity !== "high" ||
      NON_CONTEXTUAL_CATEGORIES.has(flag.category) ||
      isStructuredSecondaryFlag(result, flag) ||
      exactUniqueRange(result.draftText, flag.text)
    ) {
      continue;
    }
    reasons.push(flag.reason.trim());
  }
  for (const discrepancy of result.review?.discrepancies ?? []) {
    if (
      discrepancy.severity === "high" &&
      !lineRange(result.draftText, discrepancy.lineNumber, discrepancy.sourceText)
    ) {
      reasons.push(discrepancy.reason.trim());
    }
  }
  return [...new Set(reasons.filter(Boolean))];
}

/**
 * Re-anchor marked passages after an authorised whole-document edit. Marked text must
 * remain byte-for-byte intact, unique, and in its original logical order.
 */
export function remapReviewItemsAfterWholeDocumentEdit(
  currentText: string,
  submittedText: string,
  items: TranscriptionReviewItem[],
): TranscriptionReviewItem[] {
  const ordered = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const positions = new Map<string, { start: number; end: number }>();
  let priorEnd = -1;

  for (const item of ordered) {
    if (!item.reviewedText || currentText.slice(item.start, item.end) !== item.reviewedText) {
      throw new Error("A marked passage is no longer attached to the current transcription. Reload before editing.");
    }
    const start = submittedText.indexOf(item.reviewedText);
    const repeated = start >= 0 && submittedText.indexOf(item.reviewedText, start + item.reviewedText.length) >= 0;
    const end = start + item.reviewedText.length;
    if (start < 0 || repeated || start < priorEnd) {
      throw new Error(
        "A marked passage was changed, duplicated, or reordered. Use that passage's contextual review control instead.",
      );
    }
    positions.set(item.id, { start, end });
    priorEnd = end;
  }

  return items.map((item) => ({ ...item, ...positions.get(item.id)! }));
}

export function unresolvedRequiredReviewItems(items: TranscriptionReviewItem[] | null | undefined) {
  return (items ?? []).filter(
    (item) =>
      item.reviewStatus === "needs_rescan" ||
      (item.uncertaintyState === "review_required" && item.reviewStatus === "unreviewed"),
  );
}
