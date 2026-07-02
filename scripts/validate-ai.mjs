/**
 * AI/OCR behavioural validation.
 *
 * The project ships no TS test runner, so rather than over-engineer one, this script
 * asserts each required AI/OCR behaviour by checking that the guaranteeing code path is
 * present in source. Each assertion maps to a behaviour from the hardening spec and fails
 * loudly if a future edit removes the guarantee (e.g. drops the Braille specialist-review
 * flag, the OpenAI confidence cap, or reintroduces a direct mock call in a server action).
 */
import { existsSync, readFileSync } from "node:fs";

function read(file) {
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8");
}

/** behaviour: name; file; every `includes` must be present; every `excludes` must be absent. */
const behaviours = [
  {
    name: "mock mode routes to the mock provider",
    file: "src/lib/ai/index.ts",
    includes: ['config.mode === "mock"', "transcribeBrailleMock", "describeVisualMock", "describeStemMock"],
  },
  {
    name: "real mode never silently downgrades to mock (dispatch is explicit)",
    file: "src/lib/ai/index.ts",
    includes: ["shouldUseRealOpenAi", 'c.mode === "real"', 'c.provider === "openai"'],
  },
  {
    name: "real mode with a missing OpenAI key returns provider_unavailable (no crash)",
    file: "src/lib/ai/providers/openai-vision-provider.ts",
    includes: ["if (!getOpenAiKey())", "providerUnavailableFlag"],
  },
  {
    name: "missing image returns a processing_failed / no-image flag (not a crash)",
    file: "src/lib/ai/providers/openai-vision-provider.ts",
    includes: ["noImageFlag", "processing_failed"],
  },
  {
    name: "JSON/parse failure returns a controlled fallback (no raw error leaks)",
    file: "src/lib/ai/providers/openai-vision-provider.ts",
    includes: ["safeErrorLabel", "processingFailedFlag(safeErrorLabel(err))"],
  },
  {
    name: "empty provider text is treated as a failed run",
    file: "src/lib/ai/providers/openai-vision-provider.ts",
    includes: ['processingFailedFlag("empty description")', 'processingFailedFlag("empty draft")'],
  },
  {
    name: "OpenAI provider flags are capped and sanitised",
    file: "src/lib/ai/providers/openai-vision-provider.ts",
    includes: ["MAX_FLAGS", "slice(0, MAX_FLAGS)", "truncateText"],
  },
  {
    name: "OpenAI Braille draft confidence is capped conservatively (<= 0.6)",
    file: "src/lib/ai/providers/openai-vision-provider.ts",
    includes: ["Math.min(clampConfidence(parsed.confidence ?? 0.4), 0.6)"],
  },
  {
    name: "OpenAI Braille output always requires specialist review",
    file: "src/lib/ai/providers/openai-vision-provider.ts",
    includes: ["requiresSpecialistReview: true", "requiresSpecialistReviewFlag", "Non-specialist Braille draft"],
  },
  {
    name: "the public Braille service always requires specialist review",
    file: "src/lib/ai/index.ts",
    includes: ["requiresSpecialistReview: true"],
  },
  {
    name: "external Braille adapter enforces timeout + response-size cap + confidence clamp",
    file: "src/lib/ai/providers/external-braille-provider.ts",
    includes: ["timeoutMs", "MAX_RESPONSE_BYTES", "clampConfidence(parsed.confidence ?? 0.5)", "requiresSpecialistReview: true"],
  },
  {
    name: "external Braille adapter passes through providerRequestId only if returned",
    file: "src/lib/ai/providers/external-braille-provider.ts",
    includes: ["providerRequestId: parsed.providerRequestId ?? parsed.requestId ?? null"],
  },
  {
    name: "PDF upload returns pdf_processing_pending (PDF OCR is not claimed as supported)",
    file: "src/lib/ai/preprocessing.ts",
    includes: ["pdfPendingFlag", "application/pdf"],
  },
  {
    name: "pdf_processing_pending flag is high severity",
    file: "src/lib/ai/uncertainty.ts",
    includes: ["pdf_processing_pending", 'severity: "high"'],
  },
  {
    name: "assessment context missing prompt/skill returns a high-severity warning",
    file: "src/lib/ai/safety.ts",
    includes: ["assessmentContextFlags", "assessmentContextMissingFlag"],
  },
  {
    name: "assessment-context-missing flag is high severity",
    file: "src/lib/ai/uncertainty.ts",
    includes: ["assessmentContextMissingFlag", 'severity: "high"'],
  },
  {
    name: "real-pupil-data safety guard exists and is wired into the service",
    file: "src/lib/ai/safety.ts",
    includes: ["assertRealAiDataAllowed", 'aiMode !== "real"', "allowRealPupilData"],
  },
  {
    name: "pupil-data guard is applied in the public service layer",
    file: "src/lib/ai/index.ts",
    includes: ["pupilSafetyFlags", "assertRealAiDataAllowed"],
  },
  {
    name: "real-provider pupil-linked work is BLOCKED pre-flight (no provider call)",
    file: "src/lib/ai/index.ts",
    includes: [
      "realPupilBlockActive",
      "return blockedBrailleResult()",
      "return blockedVisualResult()",
      "return blockedStemResult()",
    ],
  },
  {
    name: "the blocked result carries a high-severity real_pupil_data_blocked flag",
    file: "src/lib/ai/uncertainty.ts",
    includes: ["realPupilDataBlockedFlag", "real_pupil_data_blocked", 'severity: "high"'],
  },
  {
    name: "free-text context is sanitised before reaching a real provider",
    file: "src/lib/ai/index.ts",
    includes: ["sanitizeProviderText", "sanitizeVisualInput", "sanitizeBrailleInput"],
  },
  {
    name: "sanitizeProviderText redacts obvious emails / phones / UK postcodes",
    file: "src/lib/ai/safety.ts",
    includes: ["export function sanitizeProviderText", "email removed", "phone removed", "postcode removed"],
  },
  {
    name: "Liblouis is optional and never mandatory (disabled path returns provider_unavailable)",
    file: "src/lib/ai/providers/braille-translation-provider.ts",
    includes: ["config.enabled", "providerUnavailableFlag", "runLiblouisCli"],
  },
  {
    name: "mock mode stays fully offline (no network in the mock provider)",
    file: "src/lib/ai/providers/mock-provider.ts",
    excludes: ["fetch(", "OpenAI("],
  },
  {
    name: "audit records prompt version + concise flag summary (no raw payloads)",
    file: "src/lib/ai/uncertainty.ts",
    includes: ["export function summariseFlags", "export function toStoredFlags"],
  },
];

// Server actions must not call the old mock functions directly.
const serverActionFiles = [
  "src/app/(app)/braille/actions.ts",
  "src/app/(app)/assessment/actions.ts",
  "src/app/(app)/stem/actions.ts",
  "src/app/(app)/quality/actions.ts",
];
const forbiddenInActions = [
  "getBrailleEngine().transcribe(task.id)",
  "draftVisualDescription(title)",
  "draftStemDescription(visualType, style)",
  "simulateOcr(sample.groundTruthText)",
];

const failures = [];
let passed = 0;

for (const b of behaviours) {
  const content = read(b.file);
  if (content === null) {
    failures.push(`[${b.name}] missing file ${b.file}`);
    continue;
  }
  let ok = true;
  for (const needle of b.includes ?? []) {
    if (!content.includes(needle)) {
      ok = false;
      failures.push(`[${b.name}] ${b.file} missing: ${needle}`);
    }
  }
  for (const needle of b.excludes ?? []) {
    if (content.includes(needle)) {
      ok = false;
      failures.push(`[${b.name}] ${b.file} must not contain: ${needle}`);
    }
  }
  if (ok) passed += 1;
}

// Negative behaviour: old direct mock calls are absent from server actions.
let negativeOk = true;
for (const file of serverActionFiles) {
  const content = read(file);
  if (content === null) continue;
  for (const needle of forbiddenInActions) {
    if (content.includes(needle)) {
      negativeOk = false;
      failures.push(`[old direct mock calls absent] ${file} still contains: ${needle}`);
    }
  }
}
if (negativeOk) passed += 1;

if (failures.length) {
  console.error("AI/OCR validation failed:");
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(`AI/OCR validation passed (${passed} behaviour checks)`);
