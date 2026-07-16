/**
 * Public AI/OCR service layer.
 *
 * The ONLY entry point product code should use. It resolves configuration, preprocesses
 * uploaded images, dispatches to the right provider (mock vs. real OpenAI vs. external
 * Braille OCR), and merges preprocessing warnings into the result. Callers get a fully
 * formed, provenance-stamped result and never touch a provider directly.
 */
import type {
  AiProcessingMeta,
  BrailleOcrInput,
  BrailleOcrResult,
  StemDescriptionInput,
  StemDescriptionResult,
  UncertaintyFlag,
  VisualDescriptionInput,
  VisualDescriptionResult,
} from "./types";
import { getAiConfig } from "./config";
import { preprocessImage } from "./preprocessing";
import { finishMeta, startRun } from "./meta";
import { realPupilDataBlockedFlag, requiresSpecialistReviewFlag } from "./uncertainty";
import { describeStemMock, describeVisualMock, transcribeBrailleMock } from "./providers/mock-provider";
import {
  describeStemWithOpenAI,
  describeVisualWithOpenAI,
  transcribeBrailleWithOpenAIDraft,
} from "./providers/openai-vision-provider";
import { transcribeBrailleExternal } from "./providers/external-braille-provider";
import { transcribeBrailleWithAbc } from "./providers/abc-braille-provider";

import { assertRealAiDataAllowed, sanitizeProviderText } from "./safety";

export * from "./types";
export { getAiConfig, isRealAiEnabled, getUploadLimits, validateUpload } from "./config";
export {
  mapFlagsToLowConfidenceRegions,
  mapFlagsToAnswerSensitiveFlags,
  summariseFlags,
  toStoredFlags,
} from "./uncertainty";
export { simulateOcrMock } from "./providers/mock-provider";

/** Pupil-data safety flags for the current config + task. Boolean pupil-link only. */
function pupilSafetyFlags(hasLinkedPupil: boolean | undefined, objectLabel: string): UncertaintyFlag[] {
  const config = getAiConfig();
  return assertRealAiDataAllowed({
    aiMode: config.mode,
    allowRealPupilData: config.allowRealPupilData,
    hasLinkedPupil,
    objectLabel,
  });
}

/**
 * Preflight guard: true when a real-provider call must be BLOCKED because the task is
 * pupil-linked, AI_MODE is real, and ALLOW_REAL_PUPIL_DATA is false. In this state no
 * file or context is sent to any provider. Mock mode is never affected.
 */
function realPupilBlockActive(hasLinkedPupil?: boolean): boolean {
  const c = getAiConfig();
  return c.mode === "real" && Boolean(hasLinkedPupil) && !c.allowRealPupilData;
}

function realBraillePupilBlockActive(hasLinkedPupil?: boolean): boolean {
  const c = getAiConfig();
  const usesRealProvider =
    c.brailleOcrProvider === "abc_braille_web" ||
    (c.mode === "real" && c.brailleOcrProvider !== "mock");
  return usesRealProvider && Boolean(hasLinkedPupil) && !c.allowRealPupilData;
}

/** Provenance stamp for a blocked run — records that no real provider was called. */
function blockedMeta(): AiProcessingMeta {
  return finishMeta(startRun(), {
    provider: "blocked",
    model: "none",
    engineVersion: "n/a",
    promptVersion: "real-pupil-block-v1",
    mode: "real",
  });
}

function blockedBrailleResult(): BrailleOcrResult {
  return {
    draftText: "",
    confidence: 0,
    flags: [realPupilDataBlockedFlag(), requiresSpecialistReviewFlag()],
    rawBraille: null,
    rawCells: null,
    meta: blockedMeta(),
    requiresSpecialistReview: true,
  };
}

function blockedVisualResult(): VisualDescriptionResult {
  return {
    visualType: "other",
    neutralDescription: "",
    visibleElements: [],
    labelsDetected: [],
    spatialLayout: "",
    answerSensitiveFlags: [realPupilDataBlockedFlag()],
    confidence: 0,
    meta: blockedMeta(),
    requiresHumanApproval: true,
  };
}

function blockedStemResult(): StemDescriptionResult {
  return {
    structuredDescription: "",
    sections: [],
    answerSensitiveFlags: [realPupilDataBlockedFlag()],
    confidence: 0,
    meta: blockedMeta(),
    requiresHumanApproval: true,
  };
}

/** Sanitise free-text fields before they reach a REAL provider. Mock input is untouched. */
function sanitizeVisualInput<T extends VisualDescriptionInput>(input: T): T {
  return {
    ...input,
    title: sanitizeProviderText(input.title) ?? "",
    subject: sanitizeProviderText(input.subject),
    yearGroup: sanitizeProviderText(input.yearGroup),
    questionPrompt: sanitizeProviderText(input.questionPrompt),
    assessedSkill: sanitizeProviderText(input.assessedSkill),
  };
}

function sanitizeBrailleInput(input: BrailleOcrInput): BrailleOcrInput {
  return {
    ...input,
    title: sanitizeProviderText(input.title) ?? "",
    subject: sanitizeProviderText(input.subject),
    yearGroup: sanitizeProviderText(input.yearGroup),
    fileName: input.fileName ? sanitizeProviderText(input.fileName) ?? undefined : undefined,
  };
}

/** Preprocess an uploaded image when present; returns the (possibly) normalised data URL. */
async function prepare(input: { dataUrl?: string; imageUrl?: string; mimeType?: string }): Promise<{
  dataUrl?: string;
  imageUrl?: string;
  warnings: UncertaintyFlag[];
}> {
  if (!input.dataUrl) return { dataUrl: input.dataUrl, imageUrl: input.imageUrl, warnings: [] };
  const pre = await preprocessImage({ dataUrl: input.dataUrl, imageUrl: input.imageUrl, mimeType: input.mimeType });
  return {
    dataUrl: pre.processedDataUrl || input.dataUrl,
    imageUrl: pre.imageUrl ?? input.imageUrl,
    warnings: pre.warnings,
  };
}

/**
 * Braille OCR. In mock mode always uses the deterministic mock. In real mode dispatches by
 * `BRAILLE_OCR_PROVIDER`: abc_braille_web (default), openai_vision_draft
 * (non-specialist draft), external_braille_ocr, or explicit mock.
 * Output ALWAYS requires specialist verification.
 */
export async function transcribeBraille(input: BrailleOcrInput): Promise<BrailleOcrResult> {
  const config = getAiConfig();

  // Mock mode is deliberately offline and deterministic. Return before image
  // preprocessing so a demo does not decode/re-encode a multi-megabyte upload or
  // accidentally call an external OCR workflow configured for production.
  if (config.mode === "mock") return transcribeBrailleMock(input);

  // Preflight block: pupil-linked + real mode + not approved → never reach a real provider.
  if (realBraillePupilBlockActive(input.hasLinkedPupil)) return blockedBrailleResult();

  const { dataUrl, imageUrl, warnings } = await prepare(input);
  const routed = { ...input, dataUrl, imageUrl };

  let result: BrailleOcrResult;
  if (config.brailleOcrProvider === "abc_braille_web") {
    result = await transcribeBrailleWithAbc(sanitizeBrailleInput(routed));
  } else if (config.brailleOcrProvider === "openai_vision_draft") {
    result = await transcribeBrailleWithOpenAIDraft(sanitizeBrailleInput(routed));
  } else if (config.brailleOcrProvider === "external_braille_ocr") {
    result = await transcribeBrailleExternal(sanitizeBrailleInput(routed));
  } else {
    // Real mode but Braille provider left as mock — safe default.
    result = await transcribeBrailleMock(routed);
  }

  const pupilFlags = pupilSafetyFlags(input.hasLinkedPupil, input.title);
  return {
    ...result,
    flags: [...warnings, ...pupilFlags, ...result.flags],
    requiresSpecialistReview: true,
  };
}

/** True when real OpenAI vision should be used (mock stays fully offline). */
function shouldUseRealOpenAi(): boolean {
  const c = getAiConfig();
  return c.mode === "real" && c.provider === "openai";
}

/**
 * Assessment-Safe visual description. In real mode the OpenAI provider is used and
 * self-handles a missing key by returning a controlled provider-unavailable draft (it is
 * never a silent downgrade to mock). Mock mode stays fully offline.
 */
export async function describeVisual(input: VisualDescriptionInput): Promise<VisualDescriptionResult> {
  // Mock output uses task metadata only, so pixel preprocessing is wasted work.
  if (!shouldUseRealOpenAi()) return describeVisualMock(input);
  if (realPupilBlockActive(input.hasLinkedPupil)) return blockedVisualResult();

  const { dataUrl, imageUrl, warnings } = await prepare(input);
  const routed = { ...input, dataUrl, imageUrl };
  const result = await describeVisualWithOpenAI(sanitizeVisualInput(routed));
  const pupilFlags = pupilSafetyFlags(input.hasLinkedPupil, input.title);
  return {
    ...result,
    answerSensitiveFlags: [...warnings, ...pupilFlags, ...result.answerSensitiveFlags],
    requiresHumanApproval: true,
  };
}

/** STEM structured description. Real OpenAI in real mode (self-handling missing config), else mock. */
export async function describeStemVisual(input: StemDescriptionInput): Promise<StemDescriptionResult> {
  if (!shouldUseRealOpenAi()) return describeStemMock(input);
  if (realPupilBlockActive(input.hasLinkedPupil)) return blockedStemResult();

  const { dataUrl, imageUrl, warnings } = await prepare(input);
  const routed = { ...input, dataUrl, imageUrl };
  const result = await describeStemWithOpenAI(sanitizeVisualInput(routed));
  const pupilFlags = pupilSafetyFlags(input.hasLinkedPupil, input.title);
  return {
    ...result,
    answerSensitiveFlags: [...warnings, ...pupilFlags, ...result.answerSensitiveFlags],
    requiresHumanApproval: true,
  };
}
