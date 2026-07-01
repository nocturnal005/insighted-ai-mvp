/**
 * External Braille OCR adapter.
 *
 * Calls a pluggable specialist Braille OCR HTTP endpoint (`BRAILLE_OCR_ENDPOINT`). This is
 * the seam for a real, dot/cell-aware Braille OCR engine when one is available. The API
 * key is sent only as a server-side header and never surfaces to the client. Missing
 * endpoint → provider-unavailable; failed call, timeout, oversized or bad-shape response →
 * processing-failed. Output is always a draft requiring specialist verification.
 *
 * Hardening: request timeout (configurable), response-size cap, confidence clamped to
 * [0,1], optional Liblouis back-translation when the engine returns raw Braille, and an
 * opaque `providerRequestId` passed through only when the engine supplies one. The raw
 * provider response body is never stored or audited.
 */
import { z } from "zod";
import type { BrailleOcrInput, BrailleOcrResult, UncertaintyCategory, UncertaintyFlag } from "../types";
import { getBrailleEndpointConfig } from "../config";
import { startRun, finishMeta, type RunTimer } from "../meta";
import { clampConfidence, effectiveConfidence } from "../confidence";
import { makeFlag, processingFailedFlag, providerUnavailableFlag, requiresSpecialistReviewFlag } from "../uncertainty";
import { safeErrorLabel } from "../safety";
import { getBrailleTranslationProvider } from "./braille-translation-provider";

const PROVIDER = "external_braille_ocr";
const PROMPT_VERSION = "external-braille-v1";
/** Hard cap on the response body we will read/parse (defends against a runaway endpoint). */
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
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
  providerRequestId: z.string().nullish(),
  requestId: z.string().nullish(),
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
  const { endpoint, apiKey, timeoutMs } = getBrailleEndpointConfig();
  const specialistFlag = requiresSpecialistReviewFlag();

  if (!endpoint) {
    return fallback(timer, [specialistFlag, providerUnavailableFlag("External Braille OCR endpoint")]);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
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

    // Response-size protection: reject an oversized body before parsing it.
    const declaredLength = Number(res.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
      return fallback(timer, [specialistFlag, processingFailedFlag("response too large")]);
    }
    const bodyText = await res.text();
    if (bodyText.length > MAX_RESPONSE_BYTES) {
      return fallback(timer, [specialistFlag, processingFailedFlag("response too large")]);
    }

    const parsed = responseSchema.parse(JSON.parse(bodyText));
    const modelFlags = (parsed.flags ?? []).map(toFlag);

    // Optional Liblouis back-translation when the engine returns raw Braille. We record
    // whether it was available; we do not override the engine's own draftText.
    const backTranslationFlags: UncertaintyFlag[] = [];
    if (parsed.rawBraille) {
      const bt = await getBrailleTranslationProvider().backTranslate({ rawBraille: parsed.rawBraille });
      backTranslationFlags.push(
        makeFlag({
          text: bt.available ? "Liblouis back-translation available" : "Liblouis back-translation unavailable",
          reason: bt.available
            ? "Raw Braille was returned and a Liblouis back-translation ran for cross-checking."
            : "Raw Braille was returned but Liblouis back-translation is not enabled/configured.",
          category: bt.available ? "subject_specific_term" : "provider_unavailable",
          severity: "low",
        }),
      );
    }

    const flags = [specialistFlag, ...modelFlags, ...backTranslationFlags];
    const pageResults = (parsed.pageResults ?? []).map((p, i) => ({
      pageNumber: p.pageNumber ?? i + 1,
      text: p.text,
      confidence: clampConfidence(p.confidence ?? 0),
      flags: (p.flags ?? []).map(toFlag),
    }));

    return {
      draftText: parsed.draftText,
      confidence: effectiveConfidence(clampConfidence(parsed.confidence ?? 0.5), modelFlags),
      flags,
      rawBraille: parsed.rawBraille ?? null,
      rawCells: parsed.rawCells ?? null,
      pageResults: pageResults.length ? pageResults : undefined,
      providerRequestId: parsed.providerRequestId ?? parsed.requestId ?? null,
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
    providerRequestId: null,
    meta: finishMeta(timer, { provider: PROVIDER, model: "external", engineVersion: "external-braille-ocr", promptVersion: PROMPT_VERSION, mode: "real" }),
    requiresSpecialistReview: true,
  };
}
