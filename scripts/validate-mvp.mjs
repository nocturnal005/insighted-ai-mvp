import { readFileSync } from "node:fs";

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
    file: "src/app/(app)/braille/actions.ts",
    mustContain: [
      "Specialist verification is required before teacher feedback",
      "transcription.specialist_verify",
      "feedback.approve",
    ],
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

const failures = [];

for (const check of checks) {
  const content = readFileSync(check.file, "utf8");
  for (const text of check.mustContain) {
    if (!content.includes(text)) failures.push(`${check.file} missing ${text}`);
  }
}

if (failures.length) {
  console.error("MVP validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("MVP validation passed");
