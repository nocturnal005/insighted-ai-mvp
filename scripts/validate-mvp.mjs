import { existsSync, readFileSync } from "node:fs";

// Files that must exist (AI/OCR provider layer must not be deleted).
const mustExist = [
  "src/lib/ai/index.ts",
  "src/lib/ai/config.ts",
  "src/lib/ai/providers/openai-vision-provider.ts",
  "src/lib/ai/providers/external-braille-provider.ts",
  "src/lib/ai/providers/braille-translation-provider.ts",
  "src/lib/ai/providers/mock-provider.ts",
];

// Positive checks: each file must contain each string.
const checks = [
  {
    file: "src/lib/rbac.ts",
    mustContain: [
      '"transcription.specialist_verify"',
      'role === "teaching_assistant"',
      "brailleLiterate",
    ],
  },
  {
    file: "package.json",
    mustContain: ['"openai"', '"sharp"', '"zod"'],
  },
  {
    file: ".env.example",
    mustContain: ["AI_MODE", "OPENAI_API_KEY", "BRAILLE_OCR_PROVIDER", "BRAILLE_OCR_ENDPOINT", "ALLOW_REAL_PUPIL_DATA"],
  },
  {
    file: "src/lib/ai/index.ts",
    mustContain: ["transcribeBraille", "describeVisual", "describeStemVisual"],
  },
  {
    file: "src/app/(app)/braille/actions.ts",
    mustContain: [
      "transcribeBraille",
      "ai.braille_ocr.run",
      "Specialist verification is required before teacher feedback",
      "transcription.specialist_verify",
      "feedback.approve",
    ],
  },
  {
    file: "src/app/(app)/assessment/actions.ts",
    mustContain: ["describeVisual", "ai.visual_description.run"],
  },
  {
    file: "src/app/(app)/stem/actions.ts",
    mustContain: ["describeStemVisual", "ai.stem_description.run"],
  },
  {
    file: "src/app/(app)/quality/actions.ts",
    mustContain: ["transcribeBraille", "eval.run"],
  },
  {
    file: "src/lib/export-content.ts",
    mustContain: [
      "specialist_verified",
      "Feedback report must be teacher approved before export",
      "Subject teacher feedback",
    ],
  },
  {
    file: "src/lib/session.ts",
    mustContain: ["DEMO_MODE", "secure: process.env.NODE_ENV === \"production\""],
  },
  {
    file: "src/lib/store.ts",
    mustContain: [".insighted-data", "purgeExpiredUploads", "storagePath"],
  },
  {
    file: "scripts/reset-demo.mjs",
    mustContain: [".insighted-data", "rmSync"],
  },
];

// Negative checks: server actions must NOT call the old mock functions directly.
const negativeChecks = [
  {
    files: [
      "src/app/(app)/braille/actions.ts",
      "src/app/(app)/assessment/actions.ts",
      "src/app/(app)/stem/actions.ts",
      "src/app/(app)/quality/actions.ts",
    ],
    mustNotContain: [
      "getBrailleEngine().transcribe(task.id)",
      "draftVisualDescription(title)",
      "draftStemDescription(visualType, style)",
      "simulateOcr(sample.groundTruthText)",
    ],
  },
];

const failures = [];

for (const file of mustExist) {
  if (!existsSync(file)) failures.push(`missing required file ${file}`);
}

for (const check of checks) {
  if (!existsSync(check.file)) {
    failures.push(`missing file ${check.file}`);
    continue;
  }
  const content = readFileSync(check.file, "utf8");
  for (const text of check.mustContain) {
    if (!content.includes(text)) failures.push(`${check.file} missing ${text}`);
  }
}

for (const group of negativeChecks) {
  for (const file of group.files) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const text of group.mustNotContain) {
      if (content.includes(text)) failures.push(`${file} still contains old mock call: ${text}`);
    }
  }
}

if (failures.length) {
  console.error("MVP validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("MVP validation passed");
