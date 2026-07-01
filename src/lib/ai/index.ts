/**
 * Public AI/OCR service layer.
 *
 * The ONLY entry point product code should use. It resolves configuration, preprocesses
 * uploaded images, dispatches to the right provider (mock vs. real OpenAI vs. external
 * Braille OCR), and merges preprocessing warnings into the result. Callers get a fully
 * formed, provenance-stamped result and never touch a provider directly.
 */
import type {
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
import { describeStemMock, describeVisualMock, transcribeBrailleMock } from "./providers/mock-provider";
import {
  describeStemWithOpenAI,
  describeVisualWithOpenAI,
  transcribeBrailleWithOpenAIDraft,
} from "./providers/openai-vision-provider";
import { transcribeBrailleExternal } from "./providers/external-braille-provider";

import { assertRealAiDataAllowed } from "./safety";

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
 * `BRAILLE_OCR_PROVIDER`: openai_vision_draft (non-specialist draft) or external_braille_ocr.
 * Output ALWAYS requires specialist verification.
 */
export async function transcribeBraille(input: BrailleOcrInput): Promise<BrailleOcrResult> {
  const config = getAiConfig();
  const { dataUrl, imageUrl, warnings } = await prepare(input);
  const routed = { ...input, dataUrl, imageUrl };

  let result: BrailleOcrResult;
  if (config.mode === "mock") {
    result = await transcribeBrailleMock(routed);
  } else if (config.brailleOcrProvider === "openai_vision_draft") {
    result = await transcribeBrailleWithOpenAIDraft(routed);
  } else if (config.brailleOcrProvider === "external_braille_ocr") {
    result = await transcribeBrailleExternal(routed);
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
  const { dataUrl, imageUrl, warnings } = await prepare(input);
  const routed = { ...input, dataUrl, imageUrl };
  const result = shouldUseRealOpenAi() ? await describeVisualWithOpenAI(routed) : await describeVisualMock(routed);
  const pupilFlags = pupilSafetyFlags(input.hasLinkedPupil, input.title);
  return {
    ...result,
    answerSensitiveFlags: [...warnings, ...pupilFlags, ...result.answerSensitiveFlags],
    requiresHumanApproval: true,
  };
}

/** STEM structured description. Real OpenAI in real mode (self-handling missing config), else mock. */
export async function describeStemVisual(input: StemDescriptionInput): Promise<StemDescriptionResult> {
  const { dataUrl, imageUrl, warnings } = await prepare(input);
  const routed = { ...input, dataUrl, imageUrl };
  const result = shouldUseRealOpenAi() ? await describeStemWithOpenAI(routed) : await describeStemMock(routed);
  const pupilFlags = pupilSafetyFlags(input.hasLinkedPupil, input.title);
  return {
    ...result,
    answerSensitiveFlags: [...warnings, ...pupilFlags, ...result.answerSensitiveFlags],
    requiresHumanApproval: true,
  };
}
