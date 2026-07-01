/**
 * Centralised, crash-proof AI configuration.
 *
 * All environment reads happen here. Every value has a safe default so importing this
 * module can never throw, missing API keys never break the app, and invalid provider
 * names normalise to a safe default (mock). API keys are read on demand and are never
 * returned to the UI, logs, audit entries, or error messages.
 */
import type { AiMode, AiProviderName, BrailleOcrProviderName } from "./types";

const DEFAULT_VISION_MODEL = "gpt-4.1";
const DEFAULT_TEXT_MODEL = "gpt-4.1";
const DEFAULT_MAX_UPLOAD_MB = 10;
const DEFAULT_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "application/pdf"];

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  if (v === undefined) return undefined;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : undefined;
}

function normaliseMode(raw: string | undefined): AiMode {
  return raw === "real" ? "real" : "mock";
}

function normaliseProvider(raw: string | undefined): AiProviderName {
  return raw === "openai" ? "openai" : "mock";
}

function normaliseBrailleProvider(raw: string | undefined): BrailleOcrProviderName {
  switch (raw) {
    case "openai_vision_draft":
      return "openai_vision_draft";
    case "external_braille_ocr":
      return "external_braille_ocr";
    default:
      return "mock";
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export interface AiConfig {
  mode: AiMode;
  provider: AiProviderName;
  brailleOcrProvider: BrailleOcrProviderName;
  visionModel: string;
  textModel: string;
  hasOpenAiKey: boolean;
  hasBrailleEndpoint: boolean;
  allowRealPupilData: boolean;
}

/**
 * Resolves the effective AI configuration. Never throws. Note the returned object does
 * NOT contain any secrets — only booleans indicating whether keys/endpoints are present.
 */
export function getAiConfig(): AiConfig {
  const mode = normaliseMode(readEnv("AI_MODE"));
  return {
    mode,
    provider: normaliseProvider(readEnv("AI_PROVIDER")),
    brailleOcrProvider: normaliseBrailleProvider(readEnv("BRAILLE_OCR_PROVIDER")),
    visionModel: readEnv("OPENAI_VISION_MODEL") ?? DEFAULT_VISION_MODEL,
    textModel: readEnv("OPENAI_TEXT_MODEL") ?? DEFAULT_TEXT_MODEL,
    hasOpenAiKey: Boolean(readEnv("OPENAI_API_KEY")),
    hasBrailleEndpoint: Boolean(readEnv("BRAILLE_OCR_ENDPOINT")),
    allowRealPupilData: readEnv("ALLOW_REAL_PUPIL_DATA") === "true",
  };
}

/** True only when real mode is selected AND the openai provider is configured. */
export function isRealAiEnabled(): boolean {
  const c = getAiConfig();
  return c.mode === "real" && c.provider === "openai" && c.hasOpenAiKey;
}

/** Server-only secret access. Never expose the return value to the client. */
export function getOpenAiKey(): string | undefined {
  return readEnv("OPENAI_API_KEY");
}

/** Server-only Braille OCR endpoint + key. Never expose to the client. */
export function getBrailleEndpointConfig(): { endpoint?: string; apiKey?: string } {
  return {
    endpoint: readEnv("BRAILLE_OCR_ENDPOINT"),
    apiKey: readEnv("BRAILLE_OCR_API_KEY"),
  };
}

export interface UploadLimits {
  maxBytes: number;
  maxMb: number;
  allowedTypes: string[];
}

export function getUploadLimits(): UploadLimits {
  const maxMb = parsePositiveInt(readEnv("MAX_UPLOAD_MB"), DEFAULT_MAX_UPLOAD_MB);
  const typesRaw = readEnv("ALLOWED_UPLOAD_TYPES");
  const allowedTypes = typesRaw
    ? typesRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [...DEFAULT_ALLOWED_TYPES];
  return { maxMb, maxBytes: maxMb * 1024 * 1024, allowedTypes };
}

/** Validate an upload's type + size against configured limits. */
export function validateUpload(params: { mimeType?: string | null; byteSize?: number | null }): {
  ok: boolean;
  reason?: string;
} {
  const limits = getUploadLimits();
  const type = (params.mimeType ?? "").toLowerCase();
  if (type && !limits.allowedTypes.includes(type)) {
    return { ok: false, reason: `Unsupported file type. Allowed: ${limits.allowedTypes.join(", ")}` };
  }
  if (typeof params.byteSize === "number" && params.byteSize > limits.maxBytes) {
    return { ok: false, reason: `File exceeds ${limits.maxMb}MB limit` };
  }
  return { ok: true };
}
