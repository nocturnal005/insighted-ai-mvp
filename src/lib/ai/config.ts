/**
 * Centralised, crash-proof AI configuration.
 *
 * All environment reads happen here. Every value has a safe default so importing this
 * module can never throw, missing API keys never break the app, and invalid provider
 * names normalise to a safe default (mock). API keys are read on demand and are never
 * returned to the UI, logs, audit entries, or error messages.
 */
import type { AiMode, AiProviderName, BrailleOcrProviderName } from "./types";

const DEFAULT_VISION_MODEL = "gpt-5.4-mini";
const DEFAULT_TEXT_MODEL = "gpt-4.1";
const DEFAULT_MAX_UPLOAD_MB = 10;
const DEFAULT_OPENAI_TIMEOUT_MS = 60000;
const DEFAULT_OPENAI_MAX_RETRIES = 1;
const DEFAULT_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "application/pdf"];
const DEFAULT_BRAILLE_OCR_TIMEOUT_MS = 30000;
const DEFAULT_ABC_BRAILLE_TIMEOUT_MS = 120000;
const DEFAULT_ABC_BRAILLE_URL = "https://www.abcbraille.com";
const DEFAULT_ABC_BRAILLE_TABLE = "en-ueb-g2.ctb";
const DEFAULT_LIBLOUIS_TABLE = "en-ueb-g2.ctb";
const DEFAULT_LIBLOUIS_DISPLAY_TABLE = "unicode.dis";
const DEFAULT_LIBLOUIS_TIMEOUT_MS = 5000;

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
  if (!raw) return "abc_braille_web";
  switch (raw) {
    case "openai_vision_draft":
      return "openai_vision_draft";
    case "external_braille_ocr":
      return "external_braille_ocr";
    case "abc_braille_web":
      return "abc_braille_web";
    case "abc_openai_review":
      return "abc_openai_review";
    default:
      // A typo must never cause a real-provider upload. Only an unset value defaults to
      // ABC Braille; an invalid explicit value keeps the original safe mock fallback.
      return "mock";
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
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
  // OpenAI is the only live Assessment/STEM provider in this build. Treat the
  // contradictory AI_MODE=real + AI_PROVIDER=mock combination as live OpenAI so a
  // stale environment variable can never make an uploaded diagram receive fake,
  // metadata-only feedback.
  const provider = mode === "real" ? "openai" : normaliseProvider(readEnv("AI_PROVIDER"));
  return {
    mode,
    provider,
    brailleOcrProvider: normaliseBrailleProvider(readEnv("BRAILLE_OCR_PROVIDER")),
    visionModel: readEnv("OPENAI_VISION_MODEL") ?? DEFAULT_VISION_MODEL,
    textModel: readEnv("OPENAI_TEXT_MODEL") ?? DEFAULT_TEXT_MODEL,
    hasOpenAiKey: Boolean(readEnv("OPENAI_API_KEY")),
    hasBrailleEndpoint:
      ["abc_braille_web", "abc_openai_review"].includes(
        normaliseBrailleProvider(readEnv("BRAILLE_OCR_PROVIDER")),
      ) ||
      Boolean(readEnv("BRAILLE_OCR_ENDPOINT") ?? inAppBrailleEndpoint()),
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

/** Bound provider latency so an interactive action cannot inherit SDK-scale waits. */
export function getOpenAiRequestConfig(): { timeoutMs: number; maxRetries: number } {
  return {
    timeoutMs: parsePositiveInt(readEnv("OPENAI_TIMEOUT_MS"), DEFAULT_OPENAI_TIMEOUT_MS),
    maxRetries: parseNonNegativeInt(readEnv("OPENAI_MAX_RETRIES"), DEFAULT_OPENAI_MAX_RETRIES),
  };
}

/**
 * Where the Braille OCR engine lives.
 *
 * The engine ships with this deployment as a Python serverless function
 * (`api/ocr.py`), so on Vercel it is reachable on our own origin and needs no
 * configuration — one deployment, one URL, nothing separate to host or wake.
 * BRAILLE_OCR_ENDPOINT still wins when set, which is how local development
 * points at the standalone engine on localhost.
 */
function inAppBrailleEndpoint(): string | undefined {
  const host = readEnv("VERCEL_URL");
  return host ? `https://${host}/api/ocr` : undefined;
}

/** Server-only Braille OCR endpoint + key. Never expose to the client. */
export function getBrailleEndpointConfig(): { endpoint?: string; apiKey?: string; timeoutMs: number } {
  return {
    endpoint: readEnv("BRAILLE_OCR_ENDPOINT") ?? inAppBrailleEndpoint(),
    apiKey: readEnv("BRAILLE_OCR_API_KEY"),
    timeoutMs: parsePositiveInt(readEnv("BRAILLE_OCR_TIMEOUT_MS"), DEFAULT_BRAILLE_OCR_TIMEOUT_MS),
  };
}

function normaliseAbcBrailleBaseUrl(raw: string | undefined): string {
  const candidate = raw ?? DEFAULT_ABC_BRAILLE_URL;
  try {
    const url = new URL(candidate);
    const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
    if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) return DEFAULT_ABC_BRAILLE_URL;
    return url.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_ABC_BRAILLE_URL;
  }
}

/** Server-only configuration for the ABC Braille web image-to-text workflow. */
export function getAbcBrailleConfig(): { baseUrl: string; languageTable: string; timeoutMs: number } {
  return {
    baseUrl: normaliseAbcBrailleBaseUrl(readEnv("ABC_BRAILLE_BASE_URL")),
    languageTable: readEnv("ABC_BRAILLE_LANGUAGE_TABLE") ?? DEFAULT_ABC_BRAILLE_TABLE,
    timeoutMs: parsePositiveInt(readEnv("ABC_BRAILLE_TIMEOUT_MS"), DEFAULT_ABC_BRAILLE_TIMEOUT_MS),
  };
}

export interface LiblouisConfig {
  enabled: boolean;
  command: string | undefined;
  table: string;
  displayTable: string;
  timeoutMs: number;
}

/**
 * Optional Liblouis back-translation config. Disabled by default so the build never depends
 * on a native Liblouis binary. Even when enabled, a missing command degrades gracefully.
 */
export function getLiblouisConfig(): LiblouisConfig {
  return {
    enabled: readEnv("LIBLOUIS_ENABLED") === "true",
    command: readEnv("LIBLOUIS_COMMAND"),
    table: readEnv("LIBLOUIS_TABLE") ?? DEFAULT_LIBLOUIS_TABLE,
    displayTable: readEnv("LIBLOUIS_DISPLAY_TABLE") ?? DEFAULT_LIBLOUIS_DISPLAY_TABLE,
    timeoutMs: parsePositiveInt(readEnv("LIBLOUIS_TIMEOUT_MS"), DEFAULT_LIBLOUIS_TIMEOUT_MS),
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
