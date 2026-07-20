/**
 * Offline source-contract checks for the hybrid Braille pipeline.
 * No provider is contacted and no API credit is spent.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const contracts = [
  {
    name: "hybrid provider preserves the ABC draft",
    file: "src/lib/ai/providers/hybrid-braille-provider.ts",
    includes: [
      "transcribeBrailleWithAbc(input)",
      "draftText: primary.draftText",
      "getBrailleTranslationProvider().backTranslate",
      "reviewBrailleWithOpenAI",
      'confidenceBasis: hasConsensus ? "consensus" : "not_supplied"',
      "requiresSpecialistReview: true",
    ],
  },
  {
    name: "OpenAI review is structured and discrepancy-only",
    file: "src/lib/ai/providers/openai-vision-provider.ts",
    includes: [
      "zodResponseFormat(brailleReviewSchema",
      "chat.completions.parse",
      "Report discrepancies only",
      "Never rewrite or replace the primary transcription",
    ],
  },
  {
    name: "review prompt forbids replacement",
    file: "src/lib/ai/prompts.ts",
    includes: [
      "The primary draft is immutable",
      "do not silently correct it",
      "An empty discrepancies array is valid",
    ],
  },
  {
    name: "Braille preprocessing keeps lossless whole-page and overlapping bands",
    file: "src/lib/ai/braille-preprocessing.ts",
    includes: ["webp({ lossless: true", "MAX_REVIEW_BANDS", "overlap", "reviewImageUrls"],
  },
  {
    name: "public service routes the hybrid provider",
    file: "src/lib/ai/index.ts",
    includes: [
      'config.brailleOcrProvider === "abc_openai_review"',
      "preprocessBrailleImage",
      "transcribeBrailleWithHybridReview",
    ],
  },
  {
    name: "hybrid evidence is stored",
    file: "src/app/(app)/braille/actions.ts",
    includes: ["confidenceBasis: result.confidenceBasis", "backTranslationText: result.review.liblouisText", "rawBraille: result.rawBraille ?? null"],
  },
  {
    name: "review UI labels evidence and never auto-applies suggestions",
    file: "src/app/(app)/braille/[id]/review-workflow.tsx",
    includes: ["Hybrid review evidence", "never applied automatically", "Primary / back-translation agreement"],
  },
  {
    name: "private implementation provenance stays server-side",
    file: "src/lib/ai/provider-visibility.ts",
    includes: ['"abc_openai_review"', "model: null"],
  },
];

const failures = [];
let passed = 0;
for (const contract of contracts) {
  if (!existsSync(contract.file)) {
    failures.push(`[${contract.name}] missing ${contract.file}`);
    continue;
  }
  const source = readFileSync(contract.file, "utf8");
  const missing = contract.includes.filter((needle) => !source.includes(needle));
  if (missing.length) {
    failures.push(...missing.map((needle) => `[${contract.name}] missing: ${needle}`));
  } else {
    passed += 1;
  }
}

if (failures.length) {
  console.error("Hybrid Braille validation failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Hybrid Braille source validation passed (${passed} contract checks)`);
console.log("Running offline hybrid workflow contract (local ABC facsimile; OpenAI disabled)...");
const runtime = spawnSync(process.execPath, ["scripts/validate-abc-braille.mjs"], {
  env: { ...process.env, BRAILLE_CONTRACT_PROVIDER: "abc_openai_review" },
  stdio: "inherit",
});
if (runtime.status !== 0) process.exit(runtime.status ?? 1);
console.log("Hybrid Braille validation passed (source + offline workflow; no paid provider calls)");
