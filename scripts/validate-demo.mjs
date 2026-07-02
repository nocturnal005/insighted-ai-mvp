import { existsSync, readFileSync } from "node:fs";

/**
 * Demo-readiness validation (Stage 3A structure + Stage 3B testing artefacts).
 *
 * Confirms the demo can be walked through confidently: the demo docs and resource
 * structure exist, the README documents the walkthrough, demo mode is still available,
 * the AI/OCR service layer is intact, no server action fell back to an old mock-only call,
 * export gates hold, and the specialist-verification rule is still enforced.
 *
 * It intentionally does NOT depend on any private/local demo files (only the checked-in
 * README + folder structure), so it passes in CI with an empty demo-resources tree.
 */

const DATA_SAFETY = "Demo resources must be synthetic, anonymised, or permission-cleared";

// Files that must exist.
const mustExist = [
  "docs/demo-test-matrix.md",
  "docs/client-demo-script.md",
  "docs/demo-readiness-checklist.md",
  "docs/demo-known-limitations.md",
  "docs/demo-bug-report.md",
  "demo-resources/README.md",
  "demo-resources/braille/.gitkeep",
  "demo-resources/visuals/.gitkeep",
  "demo-resources/stem/.gitkeep",
  "demo-resources/quality/.gitkeep",
  "demo-resources/exports/.gitkeep",
  // Stage 3C additions.
  ".github/workflows/ci.yml",
  "src/components/mobile-nav.tsx",
  "src/components/upload-note.tsx",
];

// Positive checks: each file must contain each string.
const checks = [
  {
    file: "README.md",
    mustContain: ["Demo Validation & Client", DATA_SAFETY],
  },
  {
    file: "demo-resources/README.md",
    mustContain: [DATA_SAFETY],
  },
  {
    file: "docs/demo-test-matrix.md",
    mustContain: [DATA_SAFETY, "Braille Work Review", "Specialist", "CER", "WER", "Audit"],
  },
  {
    file: "docs/client-demo-script.md",
    mustContain: [
      DATA_SAFETY,
      "InsightEd AI does not replace QTVIs, Braille-literate staff, or teachers",
    ],
  },
  {
    file: "docs/demo-readiness-checklist.md",
    mustContain: [DATA_SAFETY, "validate:demo", "No identifiable pupil data"],
  },
  {
    file: "docs/demo-known-limitations.md",
    mustContain: [DATA_SAFETY, "specialist verification", "draft"],
  },
  {
    file: "docs/demo-bug-report.md",
    mustContain: ["Bug ID", "Severity", "Fix applied"],
  },
  // Stage 3C: PDF messaging + mobile nav + CI.
  {
    file: "src/components/upload-note.tsx",
    mustContain: ["PDF OCR is not yet available"],
  },
  {
    file: "src/components/mobile-nav.tsx",
    mustContain: ["visibleNavItems", "lg:hidden"],
  },
  {
    file: ".github/workflows/ci.yml",
    mustContain: ["npm run typecheck", "npm run build", "npm run validate:demo", "node-version: 20"],
  },
  {
    file: "package.json",
    mustContain: ['"validate:demo"'],
  },
  // Demo mode remains available.
  {
    file: "src/lib/session.ts",
    mustContain: ["DEMO_MODE"],
  },
  // AI/OCR service functions still exist.
  {
    file: "src/lib/ai/index.ts",
    mustContain: ["transcribeBraille", "describeVisual", "describeStemVisual"],
  },
  // Export gates still exist.
  {
    file: "src/lib/export-content.ts",
    mustContain: [
      "Transcription must be specialist verified before export",
      "Feedback report must be teacher approved before export",
      "Description must be approved before export",
    ],
  },
  // Specialist verification wording still exists.
  {
    file: "src/app/(app)/braille/actions.ts",
    mustContain: [
      "Only QTVI, admin, or explicitly Braille-literate staff can verify Braille accuracy",
      "Specialist verification is required before teacher feedback",
      "ai.braille_ocr.run",
    ],
  },
];

// Negative checks: server actions must NOT call the old mock-only functions directly.
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
  // Stage 3C: compliance overclaim must not reappear.
  {
    files: ["src/app/login/page.tsx", "README.md"],
    mustNotContain: ["UK Public Sector Security Compliant", "UK data region"],
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
    if (!content.includes(text)) failures.push(`${check.file} missing "${text}"`);
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
  console.error("Demo validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Demo validation passed");
