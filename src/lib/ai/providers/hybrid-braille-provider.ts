/**
 * Hybrid Braille review pipeline.
 *
 * ABC Braille is always the primary image OCR engine and its draft is returned unchanged.
 * Liblouis, when configured, deterministically back-translates ABC's detected Unicode
 * Braille. OpenAI then reports structured discrepancies as review evidence only.
 */
import { cer } from "@/lib/metrics";
import { clampConfidence } from "../confidence";
import { finishMeta, startRun } from "../meta";
import { PROMPT_VERSIONS } from "../prompts";
import type {
  BrailleDiscrepancyType,
  BrailleOcrInput,
  BrailleOcrResult,
  UncertaintyCategory,
  UncertaintyFlag,
} from "../types";
import { makeFlag } from "../uncertainty";
import { transcribeBrailleWithAbc } from "./abc-braille-provider";
import { getBrailleTranslationProvider } from "./braille-translation-provider";
import { reviewBrailleWithOpenAI } from "./openai-vision-provider";

const PROVIDER = "abc_openai_review";

const discrepancyCategories: Record<BrailleDiscrepancyType, UncertaintyCategory> = {
  character: "engine_disagreement",
  word: "engine_disagreement",
  contraction: "possible_contraction_issue",
  number_sign: "possible_number_sign_issue",
  capitalisation: "possible_capitalisation_issue",
  punctuation: "engine_disagreement",
  spacing: "word_spacing_uncertainty",
  line_order: "line_order_uncertainty",
  image_quality: "low_image_quality",
  other: "engine_disagreement",
};

function secondaryUnavailableFlag(label: string, reason: string): UncertaintyFlag {
  return makeFlag({
    text: `${label} unavailable`,
    reason,
    category: "secondary_review_unavailable",
    severity: "medium",
    suggestedAction: "Continue specialist verification using the ABC draft and source image.",
  });
}

function disagreementFlags(
  discrepancies: Awaited<ReturnType<typeof reviewBrailleWithOpenAI>>["discrepancies"],
): UncertaintyFlag[] {
  return discrepancies.map((item) => {
    const location = item.lineNumber ? `Line ${item.lineNumber}: ` : "";
    const suggestion = item.suggestedText ? ` Suggested reading: “${item.suggestedText}”.` : "";
    return makeFlag({
      text: `${location}${item.sourceText || item.issueType}`,
      reason: `${item.reason}${suggestion}`,
      category: discrepancyCategories[item.issueType],
      severity: item.severity,
      suggestedAction: "Inspect the source cells and accept or reject the suggestion manually.",
    });
  });
}

function consensusConfidence(
  agreement: number | null,
  discrepancies: Awaited<ReturnType<typeof reviewBrailleWithOpenAI>>["discrepancies"],
): number {
  if (agreement === null) return 0;
  const penalty = Math.min(
    0.35,
    discrepancies.reduce((total, item) => {
      if (item.severity === "high") return total + 0.08;
      if (item.severity === "medium") return total + 0.04;
      return total + 0.015;
    }, 0),
  );
  // Cap at 0.9: ABC and Liblouis are correlated because Liblouis consumes ABC's cell data.
  return clampConfidence(0.9 * agreement - penalty);
}

export async function transcribeBrailleWithHybridReview(input: BrailleOcrInput): Promise<BrailleOcrResult> {
  const timer = startRun();
  const primary = await transcribeBrailleWithAbc(input);
  const supplementalFlags: UncertaintyFlag[] = [];

  let liblouisText = "";
  let liblouisAvailable = false;
  let liblouisEngine = "liblouis-stub";
  try {
    const liblouis = await getBrailleTranslationProvider().backTranslate({
      rawBraille: primary.rawBraille ?? undefined,
      rawCells: primary.rawCells,
      language: "en-ueb-g2",
    });
    liblouisText = liblouis.text;
    liblouisAvailable = liblouis.available;
    liblouisEngine = liblouis.engine;
    if (!liblouis.available || !liblouis.text.trim()) {
      supplementalFlags.push(
        secondaryUnavailableFlag(
          "Deterministic back-translation",
          liblouis.available
            ? "The deterministic engine could not produce a back-translation from the detected Braille cells."
            : "The optional deterministic back-translation is not configured on this server.",
        ),
      );
    }
  } catch {
    supplementalFlags.push(
      secondaryUnavailableFlag(
        "Deterministic back-translation",
        "The deterministic back-translation failed; the primary draft remains available for specialist review.",
      ),
    );
  }

  const review = await reviewBrailleWithOpenAI({
    ...input,
    primaryDraftText: primary.draftText,
    rawBraille: primary.rawBraille,
    liblouisText: liblouisText || null,
  });
  if (review.status !== "completed") {
    supplementalFlags.push(
      secondaryUnavailableFlag(
        "AI discrepancy review",
        review.summary || "The secondary vision review did not complete.",
      ),
    );
  }

  const agreement =
    primary.draftText.trim() && liblouisText.trim()
      ? clampConfidence(1 - cer(primary.draftText, liblouisText))
      : null;
  const reviewFlags = disagreementFlags(review.discrepancies);
  const hasConsensus = agreement !== null;

  return {
    // Safety invariant: the secondary model never becomes the source of the draft.
    draftText: primary.draftText,
    confidence: consensusConfidence(agreement, review.discrepancies),
    confidenceBasis: hasConsensus ? "consensus" : "not_supplied",
    flags: [...primary.flags, ...supplementalFlags, ...reviewFlags],
    rawBraille: primary.rawBraille ?? null,
    rawCells: primary.rawCells,
    pageResults: primary.pageResults,
    review: {
      status: review.status,
      summary: review.summary,
      discrepancies: review.discrepancies,
      rawBraille: primary.rawBraille ?? null,
      liblouisText: liblouisText || null,
      liblouisAvailable,
      primaryLiblouisAgreement: agreement,
      reviewImageCount: input.reviewImageUrls?.length ?? (input.dataUrl || input.imageUrl ? 1 : 0),
      model: review.model,
      processingMs: review.processingMs,
    },
    providerRequestId: review.requestId,
    meta: finishMeta(timer, {
      provider: PROVIDER,
      model: `abc-image-to-text+${liblouisEngine}+${review.model ?? "secondary-review"}`,
      engineVersion: "hybrid-braille-review-v1",
      promptVersion: PROMPT_VERSIONS.brailleReview,
      mode: "real",
    }),
    requiresSpecialistReview: true,
  };
}
