/**
 * External Braille OCR adapter.
 *
 * Calls a pluggable specialist Braille OCR HTTP endpoint (`BRAILLE_OCR_ENDPOINT`). This is
 * the seam for a real, dot/cell-aware Braille OCR engine when one is available. The API
 * key is sent only as a server-side header and never surfaces to the client. Missing
 * endpoint → provider-unavailable; failed call or bad shape → processing-failed. Output is
 * always a draft requiring specialist verification.
 */
import { z } from "zod";
import type { BrailleOcrInput, BrailleOcrResult, UncertaintyCategory, UncertaintyFlag } from "../types";
import { getBrailleEndpointConfig } from "../config";
import { startRun, finishMeta, type RunTimer } from "../meta";
import { clampConfidence, effectiveConfidence } from "../confidence";
import { makeFlag, processingFailedFlag, providerUnavailableFlag, requiresSpecialistReviewFlag } from "../uncertainty";
import { safeErrorLabel } from "../safety";

const PROVIDER = "external_braille_ocr";
const PROMPT_VERSION = "external-braille-v1";
const KNOWN_CATEGORIES = new Set<string>([
  "low_image_quality", "low_ocr_confidence", "unclear_braille_cell", "possible_contraction_issue",
  "possible_number_sign_issue", "possible_capitalisation_issue", "line_order_uncertainty",
  "word_spacing_uncertainty", "subject_specific_term",
]);

const responseSchema = z.object({
  draftText: z.string(),
  confidence: z.number().optional(),
  rawBraille: z.string().nullish(),
  rawCells: z.unknown().optional(),
  flags: z
    .array(z.object({ text: z.string(), reason: z.string(), category: z.string().optional(), severity: z.string().optional() }))
    .optional(),
  pageResults: z
    .array(
      z.object({
        pageNumber: z.number().optional(),
        text: z.string(),
        confidence: z.number().optional(),
        flags: z.array(z.object({ text: z.string(), reason: z.string(), category: z.string().optional(), severity: z.string().optional() })).optional(),
      }),
    )
    .optional(),
});

function toFlag(f: { text: string; reason: string; category?: string; severity?: string }): UncertaintyFlag {
  const category = (f.category && KNOWN_CATEGORIES.has(f.category) ? f.category : "unclear_braille_cell") as UncertaintyCategory;
  const severity = f.severity === "low" || f.severity === "high" ? f.severity : "medium";
  return makeFlag({ text: f.text, reason: f.reason, category, severity });
}

export async function transcribeBrailleExternal(input: BrailleOcrInput): Promise<BrailleOcrResult> {
  const timer = startRun();
  const { endpoint, apiKey } = getBrailleEndpointConfig();
  const specialistFlag = requiresSpecialistReviewFlag();

  if (!endpoint) {
    return fallback(timer, [specialistFlag, providerUnavailableFlag("External Braille OCR endpoint")]);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          taskId: input.taskId,
          title: input.title,
          fileName: input.fileName ?? "",
          mimeType: input.mimeType ?? "",
          dataUrl: input.dataUrl ?? "",
          subject: input.subject ?? null,
          yearGroup: input.yearGroup ?? null,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      return fallback(timer, [specialistFlag, processingFailedFlag(`status ${res.status}`)]);
    }

    const parsed = responseSchema.parse(await res.json());
    const modelFlags = (parsed.flags ?? []).map(toFlag);
    const flags = [specialistFlag, ...modelFlags];
    const pageResults = (parsed.pageResults ?? []).map((p, i) => ({
      pageNumber: p.pageNumber ?? i + 1,
      text: p.text,
      confidence: clampConfidence(p.confidence ?? 0),
      flags: (p.flags ?? []).map(toFlag),
    }));

    return {
      draftText: parsed.draftText,
      confidence: effectiveConfidence(parsed.confidence ?? 0.5, modelFlags),
      flags,
      rawBraille: parsed.rawBraille ?? null,
      rawCells: parsed.rawCells ?? null,
      pageResults: pageResults.length ? pageResults : undefined,
      meta: finishMeta(timer, { provider: PROVIDER, model: "external", engineVersion: "external-braille-ocr", promptVersion: PROMPT_VERSION, mode: "real" }),
      requiresSpecialistReview: true,
    };
  } catch (err) {
    return fallback(timer, [specialistFlag, processingFailedFlag(safeErrorLabel(err))]);
  }
}

function fallback(timer: RunTimer, flags: UncertaintyFlag[]): BrailleOcrResult {
  return {
    draftText: "",
    confidence: 0,
    flags,
    rawBraille: null,
    rawCells: null,
    meta: finishMeta(timer, { provider: PROVIDER, model: "external", engineVersion: "external-braille-ocr", promptVersion: PROMPT_VERSION, mode: "real" }),
    requiresSpecialistReview: true,
  };
}
