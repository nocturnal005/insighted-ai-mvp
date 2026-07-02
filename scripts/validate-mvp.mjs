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
  // Stage 3C: build reliability — protected app layout is explicitly dynamic.
  {
    file: "src/app/(app)/layout.tsx",
    mustContain: ['export const dynamic = "force-dynamic"'],
  },
  // Stage 3C: Server Actions body limit is aligned above the app upload cap.
  {
    file: "next.config.mjs",
    mustContain: ['bodySizeLimit: "15mb"'],
  },
  // Stage 3C: export kind is validated at runtime (no unsafe cast).
  {
    file: "src/lib/export-content.ts",
    mustContain: ["EXPORT_KINDS", "export function isExportKind"],
  },
  {
    file: "src/app/api/export/[id]/route.ts",
    mustContain: ["isExportKind", 'export const dynamic = "force-dynamic"'],
  },
  // Stage 3C: admin role validation + Braille-literate management.
  {
    file: "src/app/(app)/admin/actions.ts",
    mustContain: [
      "ALL_ROLES.includes",
      "export async function setBrailleLiterate",
      "staff.role_update",
      "staff.braille_literate_update",
    ],
  },
  // Stage 3C: quality uploads use the tracked Upload model (module "quality").
  {
    file: "src/lib/types.ts",
    mustContain: ['"braille" | "visual" | "stem" | "quality"'],
  },
  {
    file: "src/app/(app)/quality/actions.ts",
    mustContain: ['module: "quality"', "createUpload", "getUploadById"],
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
  // Stage 3C: no unsafe export-kind cast; runtime validation is used instead.
  {
    files: ["src/app/api/export/[id]/route.ts", "src/app/print/[id]/page.tsx"],
    mustNotContain: ["as ExportKind"],
  },
  // Stage 3C: editable fields use the null-sentinel (?? ), not the empty-string || fallback
  // that prevented a field from being intentionally cleared.
  {
    files: ["src/app/(app)/braille/[id]/review-workflow.tsx"],
    mustNotContain: ["text || t?.editedText", "comments || fb?.teacherComments"],
  },
  {
    files: [
      "src/app/(app)/assessment/[id]/visual-workflow.tsx",
      "src/app/(app)/stem/[id]/stem-workflow.tsx",
    ],
    mustNotContain: ["text || task.editedDescription"],
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
