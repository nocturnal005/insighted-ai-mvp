/**
 * OpenAI vision provider.
 *
 * Draft visual/STEM descriptions and a NON-SPECIALIST Braille draft, produced by a
 * general vision model. Every call: uses the uploaded image (never the title alone),
 * requests strict JSON, validates it with zod, and on any failure returns a controlled
 * fallback result — raw provider errors and secrets never reach the caller. OpenAI Braille
 * output is explicitly draft-only and always `requiresSpecialistReview: true`.
 */
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import type {
  BrailleDiscrepancyType,
  BrailleOcrInput,
  BrailleOcrResult,
  BrailleReviewDiscrepancy,
  BrailleReviewStatus,
  DetectedVisualType,
  StemDescriptionInput,
  StemDescriptionResult,
  UncertaintyCategory,
  UncertaintyFlag,
  UncertaintySeverity,
  VisualDescriptionInput,
  VisualDescriptionResult,
} from "../types";
import { getAiConfig, getOpenAiKey, getOpenAiRequestConfig } from "../config";
import { startRun, finishMeta, type RunTimer } from "../meta";
import {
  buildBrailleDraftPrompt,
  buildBrailleReviewPrompt,
  buildStemPrompt,
  buildVisualPrompt,
  PROMPT_VERSIONS,
} from "../prompts";
import { clampConfidence, effectiveConfidence } from "../confidence";
import {
  makeFlag,
  processingFailedFlag,
  providerUnavailableFlag,
  requiresSpecialistReviewFlag,
} from "../uncertainty";
import { assessmentContextFlags, safeErrorLabel, sanitizeProviderText, truncateText } from "../safety";

const PROVIDER = "openai";
/** Never store/display more than this many provider flags, however many are returned. */
const MAX_FLAGS = 20;

const KNOWN_CATEGORIES: UncertaintyCategory[] = [
  "low_image_quality", "low_ocr_confidence", "unclear_braille_cell", "possible_contraction_issue",
  "possible_number_sign_issue", "possible_capitalisation_issue", "line_order_uncertainty",
  "word_spacing_uncertainty", "subject_specific_term", "engine_disagreement",
  "secondary_review_unavailable", "answer_leak_risk", "trend_revealed",
  "comparison_revealed", "answer_value_revealed", "label_reveals_answer",
  "visual_emphasis_reveals_answer", "relationship_interpreted", "cause_effect_implied",
  "unnecessary_clue", "requires_specialist_review", "provider_unavailable", "processing_failed",
  "pdf_processing_pending",
];

function coerceCategory(raw: unknown, fallback: UncertaintyCategory): UncertaintyCategory {
  return typeof raw === "string" && (KNOWN_CATEGORIES as string[]).includes(raw)
    ? (raw as UncertaintyCategory)
    : fallback;
}

function coerceSeverity(raw: unknown): UncertaintySeverity {
  return raw === "low" || raw === "high" ? raw : "medium";
}

// ── zod schemas for provider responses ──────────────────────────────────────

const rawFlagSchema = z.object({
  text: z.string(),
  reason: z.string(),
  category: z.string().optional(),
  severity: z.string().optional(),
});

const visualSchema = z.object({
  visualType: z.string().optional(),
  neutralDescription: z.string(),
  visibleElements: z.array(z.string()).optional(),
  labelsDetected: z.array(z.string()).optional(),
  spatialLayout: z.string().optional(),
  confidence: z.number().optional(),
  answerSensitiveFlags: z.array(rawFlagSchema).optional(),
});

const stemSchema = z.object({
  sections: z
    .array(z.object({ heading: z.string(), content: z.string(), confidence: z.number().optional() }))
    .optional(),
  structuredDescription: z.string().optional(),
  confidence: z.number().optional(),
  answerSensitiveFlags: z.array(rawFlagSchema).optional(),
});

const brailleSchema = z.object({
  draftText: z.string(),
  confidence: z.number().optional(),
  flags: z.array(rawFlagSchema).optional(),
});

const brailleDiscrepancyTypes = [
  "character", "word", "contraction", "number_sign", "capitalisation", "punctuation",
  "spacing", "line_order", "image_quality", "other",
] as const satisfies readonly BrailleDiscrepancyType[];

const brailleReviewSchema = z
  .object({
    summary: z.string(),
    discrepancies: z
      .array(
        z
          .object({
            lineNumber: z.number().int().min(1).nullable(),
            sourceText: z.string(),
            suggestedText: z.string().nullable(),
            issueType: z.enum(brailleDiscrepancyTypes),
            reason: z.string(),
            severity: z.enum(["low", "medium", "high"]),
            confidence: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(MAX_FLAGS),
  })
  .strict();

const VISUAL_TYPES: DetectedVisualType[] = [
  "line_graph", "bar_chart", "table", "labelled_diagram", "science_diagram",
  "experiment_setup", "map", "photo", "other",
];

function mapRawFlags(raw: z.infer<typeof rawFlagSchema>[] | undefined, fallbackCat: UncertaintyCategory): UncertaintyFlag[] {
  return (raw ?? []).slice(0, MAX_FLAGS).map((f) =>
    makeFlag({
      // Sanitise: overlong model text/reason can never flood the UI or audit.
      text: truncateText(f.text || "Flag"),
      reason: truncateText(f.reason || ""),
      category: coerceCategory(f.category, fallbackCat),
      severity: coerceSeverity(f.severity),
    }),
  );
}

// ── OpenAI plumbing ─────────────────────────────────────────────────────────

let cachedClient: OpenAI | null = null;
let cachedApiKey: string | undefined;
let cachedTimeoutMs = 0;
let cachedMaxRetries = 0;

function getClient(): OpenAI | null {
  const apiKey = getOpenAiKey();
  if (!apiKey) return null;
  const { timeoutMs, maxRetries } = getOpenAiRequestConfig();
  if (
    !cachedClient ||
    cachedApiKey !== apiKey ||
    cachedTimeoutMs !== timeoutMs ||
    cachedMaxRetries !== maxRetries
  ) {
    cachedClient = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries });
    cachedApiKey = apiKey;
    cachedTimeoutMs = timeoutMs;
    cachedMaxRetries = maxRetries;
  }
  return cachedClient;
}

function imageContent(input: { dataUrl?: string; imageUrl?: string }): { type: "image_url"; image_url: { url: string } } | null {
  const url = input.dataUrl || input.imageUrl;
  if (!url) return null;
  return { type: "image_url", image_url: { url } };
}

async function callVisionJson(system: string, image: { type: "image_url"; image_url: { url: string } }, model: string): Promise<unknown> {
  const client = getClient();
  if (!client) throw new Error("no_client");
  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    max_completion_tokens: 6000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You output strict JSON only. No prose, no markdown fences." },
      { role: "user", content: [{ type: "text", text: system }, image] },
    ],
  });
  const text = completion.choices[0]?.message?.content ?? "";
  return JSON.parse(text);
}

// ── Public provider functions ───────────────────────────────────────────────

export interface OpenAiBrailleReviewResult {
  status: BrailleReviewStatus;
  summary: string;
  discrepancies: BrailleReviewDiscrepancy[];
  model: string | null;
  processingMs: number;
  requestId: string | null;
}

/**
 * Review an ABC Braille draft against the source image and optional Liblouis result.
 * This endpoint deliberately returns discrepancies only: it is not allowed to replace
 * the primary draft, and callers must keep every suggestion specialist-controlled.
 */
export async function reviewBrailleWithOpenAI(
  input: BrailleOcrInput & {
    primaryDraftText: string;
    rawBraille?: string | null;
    liblouisText?: string | null;
  },
): Promise<OpenAiBrailleReviewResult> {
  const started = Date.now();
  const model = getAiConfig().visionModel;
  const imageUrls = (
    input.reviewImageUrls?.length
      ? input.reviewImageUrls
      : [input.dataUrl || input.imageUrl].filter((value): value is string => Boolean(value))
  ).slice(0, 5);

  const fallback = (status: BrailleReviewStatus, summary: string): OpenAiBrailleReviewResult => ({
    status,
    summary,
    discrepancies: [],
    model: getOpenAiKey() ? model : null,
    processingMs: Date.now() - started,
    requestId: null,
  });

  if (!getOpenAiKey()) {
    return fallback("unavailable", "Secondary AI review is not configured.");
  }
  if (imageUrls.length === 0) {
    return fallback("skipped", "No image was available for secondary review.");
  }
  if (!input.primaryDraftText.trim()) {
    return fallback("skipped", "The primary Braille engine produced no draft to review.");
  }

  const client = getClient();
  if (!client) return fallback("unavailable", "Secondary AI review is not configured.");

  const prompt = buildBrailleReviewPrompt({
    primaryDraftText: sanitizeProviderText(input.primaryDraftText, 12_000) ?? "",
    rawBraille: sanitizeProviderText(input.rawBraille, 12_000),
    liblouisText: sanitizeProviderText(input.liblouisText, 12_000),
    subject: input.subject,
    yearGroup: input.yearGroup,
    reviewImageCount: imageUrls.length,
  });
  const imageParts = imageUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  }));

  try {
    const completion = await client.chat.completions.parse({
      model,
      temperature: 0,
      max_completion_tokens: 6000,
      response_format: zodResponseFormat(brailleReviewSchema, "braille_discrepancy_review"),
      messages: [
        {
          role: "system",
          content:
            "You are a cautious Braille transcription reviewer. Report discrepancies only. " +
            "Never rewrite or replace the primary transcription.",
        },
        { role: "user", content: [{ type: "text", text: prompt }, ...imageParts] },
      ],
    });
    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) return fallback("failed", "Secondary AI review returned no structured result.");

    return {
      status: "completed",
      summary: truncateText(parsed.summary || "Secondary review completed."),
      discrepancies: parsed.discrepancies.slice(0, MAX_FLAGS).map((item) => ({
        lineNumber: item.lineNumber,
        sourceText: truncateText(item.sourceText),
        suggestedText: item.suggestedText ? truncateText(item.suggestedText) : null,
        issueType: item.issueType,
        reason: truncateText(item.reason),
        severity: item.severity,
        confidence: clampConfidence(item.confidence),
      })),
      model,
      processingMs: Date.now() - started,
      requestId: completion._request_id ?? null,
    };
  } catch (error) {
    return fallback("failed", `Secondary AI review failed (${safeErrorLabel(error)}).`);
  }
}

export async function describeVisualWithOpenAI(input: VisualDescriptionInput): Promise<VisualDescriptionResult> {
  const timer = startRun();
  const model = getAiConfig().visionModel;
  const image = imageContent(input);

  const contextFlags = assessmentContextFlags({
    context: input.context,
    questionPrompt: input.questionPrompt,
    assessedSkill: input.assessedSkill,
  });

  if (!getOpenAiKey()) return visualFallback(input, timer, model, [providerUnavailableFlag("OpenAI vision"), ...contextFlags]);
  if (!image) return visualFallback(input, timer, model, [noImageFlag(), ...contextFlags]);

  try {
    const json = await callVisionJson(buildVisualPrompt(input), image, model);
    const parsed = visualSchema.parse(json);
    // An empty description is a failed run, not a valid neutral description.
    if (!parsed.neutralDescription.trim()) {
      return visualFallback(input, timer, model, [processingFailedFlag("empty description"), ...contextFlags]);
    }
    const flags = [...mapRawFlags(parsed.answerSensitiveFlags, "answer_leak_risk"), ...contextFlags];
    const visualType = (VISUAL_TYPES as string[]).includes(parsed.visualType ?? "")
      ? (parsed.visualType as DetectedVisualType)
      : "other";
    return {
      visualType,
      neutralDescription: parsed.neutralDescription,
      visibleElements: parsed.visibleElements ?? [],
      labelsDetected: parsed.labelsDetected ?? [],
      spatialLayout: parsed.spatialLayout ?? "",
      answerSensitiveFlags: flags,
      confidence: effectiveConfidence(parsed.confidence ?? 0.6, flags),
      meta: finishMeta(timer, { provider: PROVIDER, model, engineVersion: "openai-vision", promptVersion: PROMPT_VERSIONS.visual, mode: "real" }),
      requiresHumanApproval: true,
    };
  } catch (err) {
    return visualFallback(input, timer, model, [processingFailedFlag(safeErrorLabel(err)), ...contextFlags]);
  }
}

export async function describeStemWithOpenAI(input: StemDescriptionInput): Promise<StemDescriptionResult> {
  const timer = startRun();
  const model = getAiConfig().visionModel;
  const image = imageContent(input);

  if (!getOpenAiKey()) return stemFallback(timer, model, [providerUnavailableFlag("OpenAI vision")]);
  if (!image) return stemFallback(timer, model, [noImageFlag()]);

  try {
    const json = await callVisionJson(buildStemPrompt(input), image, model);
    const parsed = stemSchema.parse(json);
    const sections = (parsed.sections ?? []).map((s) => ({
      heading: s.heading,
      content: s.content,
      confidence: clampConfidence(s.confidence ?? 0.6),
    }));
    const flags = mapRawFlags(parsed.answerSensitiveFlags, "answer_leak_risk");
    const structuredDescription =
      parsed.structuredDescription ?? sections.map((s) => `${s.heading}: ${s.content}`).join("\n");
    // No usable structured output → treat as a failed run rather than an empty description.
    if (!structuredDescription.trim() && sections.length === 0) {
      return stemFallback(timer, model, [processingFailedFlag("empty description")]);
    }
    return {
      structuredDescription,
      sections,
      answerSensitiveFlags: flags,
      confidence: effectiveConfidence(parsed.confidence ?? 0.6, flags),
      meta: finishMeta(timer, { provider: PROVIDER, model, engineVersion: "openai-vision", promptVersion: PROMPT_VERSIONS.stem, mode: "real" }),
      requiresHumanApproval: true,
    };
  } catch (err) {
    return stemFallback(timer, model, [processingFailedFlag(safeErrorLabel(err))]);
  }
}

export async function transcribeBrailleWithOpenAIDraft(input: BrailleOcrInput): Promise<BrailleOcrResult> {
  const timer = startRun();
  const model = getAiConfig().visionModel;
  const image = imageContent(input);

  // The specialist-review requirement is present in EVERY outcome, success or fallback.
  const specialistFlag = requiresSpecialistReviewFlag();
  const draftOnlyFlag = makeFlag({
    text: "Non-specialist Braille draft",
    reason:
      "This transcription was produced by a general vision model, not a certified Braille " +
      "OCR engine. It is a rough draft only and must be verified by a specialist.",
    category: "requires_specialist_review",
    severity: "high",
  });

  if (!getOpenAiKey()) return brailleFallback(timer, model, [specialistFlag, draftOnlyFlag, providerUnavailableFlag("OpenAI vision")]);
  if (!image) return brailleFallback(timer, model, [specialistFlag, draftOnlyFlag, noImageFlag()]);

  try {
    const json = await callVisionJson(
      buildBrailleDraftPrompt({ subject: input.subject, yearGroup: input.yearGroup }),
      image,
      model,
    );
    const parsed = brailleSchema.parse(json);
    // Empty draft text means the model produced nothing usable — a failed run.
    if (!parsed.draftText.trim()) {
      return brailleFallback(timer, model, [specialistFlag, draftOnlyFlag, processingFailedFlag("empty draft")]);
    }
    const modelFlags = mapRawFlags(parsed.flags, "low_ocr_confidence");
    const flags = [specialistFlag, draftOnlyFlag, ...modelFlags];
    // Cap OpenAI Braille confidence conservatively — it is not specialist OCR.
    const conservative = Math.min(clampConfidence(parsed.confidence ?? 0.4), 0.6);
    return {
      draftText: parsed.draftText,
      confidence: conservative,
      flags,
      rawBraille: null,
      rawCells: null,
      meta: finishMeta(timer, { provider: PROVIDER, model, engineVersion: "openai-vision", promptVersion: PROMPT_VERSIONS.brailleDraft, mode: "real" }),
      requiresSpecialistReview: true,
    };
  } catch (err) {
    return brailleFallback(timer, model, [specialistFlag, draftOnlyFlag, processingFailedFlag(safeErrorLabel(err))]);
  }
}

// ── Controlled fallbacks ────────────────────────────────────────────────────

function noImageFlag(): UncertaintyFlag {
  return makeFlag({
    text: "No image supplied",
    reason: "OpenAI vision requires the uploaded image; it is never called on the title alone.",
    category: "processing_failed",
    severity: "high",
    suggestedAction: "Upload a PNG/JPG for this task and re-run.",
  });
}

function visualFallback(input: VisualDescriptionInput, timer: RunTimer, model: string, flags: UncertaintyFlag[]): VisualDescriptionResult {
  return {
    visualType: "other",
    neutralDescription: "No AI description was produced. Complete this description manually from the source visual.",
    visibleElements: [],
    labelsDetected: [],
    spatialLayout: "",
    answerSensitiveFlags: flags,
    confidence: 0,
    meta: finishMeta(timer, { provider: PROVIDER, model, engineVersion: "openai-vision", promptVersion: PROMPT_VERSIONS.visual, mode: "real" }),
    requiresHumanApproval: true,
  };
}

function stemFallback(timer: RunTimer, model: string, flags: UncertaintyFlag[]): StemDescriptionResult {
  return {
    structuredDescription: "No AI description was produced. Complete this structured description manually.",
    sections: [],
    answerSensitiveFlags: flags,
    confidence: 0,
    meta: finishMeta(timer, { provider: PROVIDER, model, engineVersion: "openai-vision", promptVersion: PROMPT_VERSIONS.stem, mode: "real" }),
    requiresHumanApproval: true,
  };
}

function brailleFallback(timer: RunTimer, model: string, flags: UncertaintyFlag[]): BrailleOcrResult {
  return {
    draftText: "",
    confidence: 0,
    flags,
    rawBraille: null,
    rawCells: null,
    meta: finishMeta(timer, { provider: PROVIDER, model, engineVersion: "openai-vision", promptVersion: PROMPT_VERSIONS.brailleDraft, mode: "real" }),
    requiresSpecialistReview: true,
  };
}
