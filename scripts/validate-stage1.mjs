import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;

function source(file) {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) {
    failures.push(`missing required file ${file}`);
    return "";
  }
  return readFileSync(absolute, "utf8");
}

function check(name, ok) {
  checks += 1;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok) failures.push(name);
}

function contains(file, values) {
  const content = source(file);
  for (const value of values) {
    check(`${file} contains ${value}`, content.includes(value));
  }
}

console.log("Stage 1 workflow and UI contract");

contains("src/components/submission-workflow.tsx", [
  "Upload & Translate",
  "Verify & Review",
  "Assess & Feedback",
  'aria-label="Submission workflow"',
  'aria-current={active ? "step" : undefined}',
  "sm:grid-cols-3",
]);

contains("src/app/(app)/braille/[id]/page.tsx", [
  "hydrateBrailleTask",
  "getBrailleTask",
  "Stage 1 of 3 · Upload & Translate",
  "Stage 2 of 3 · Verify & Review",
  "Stage 3 of 3 · Assess & Feedback",
  "timeline={timeline}",
  "summary={{",
]);

contains("src/app/(app)/braille/[id]/review-workflow.tsx", [
  "Submission summary",
  "Translated content",
  "Actions & review",
  "Assessment & feedback",
  "Original Braille file",
  "Run transcription",
  "Save edits",
  "Specialist verify",
  "Generate feedback",
  "Approve report",
  "Review history",
  "TaskTimeline",
  "lg:grid-cols-[minmax(210px,0.7fr)_minmax(0,1.8fr)]",
  "xl:grid-cols-[minmax(200px,0.65fr)_minmax(0,1.9fr)_minmax(260px,0.85fr)]",
  'aria-labelledby="submission-summary-heading"',
  'aria-labelledby="actions-review-heading"',
  'role="status"',
]);

contains("src/components/app-nav.tsx", [
  "Braille Submissions",
  "visibleNavItems",
  'can(r, "audit.read")',
  'can(r, "org.manage")',
]);

contains("src/app/(app)/dashboard/page.tsx", [
  "How every submission moves forward",
  "Continue a submission",
  "SubmissionWorkflow",
]);

contains("src/app/(app)/braille/new/page.tsx", [
  "Upload Braille work",
  "Stage 1 of 3",
  "SubmissionWorkflow current={1}",
]);

contains("src/app/globals.css", [":focus-visible", "prefers-reduced-motion"]);
contains("src/app/layout.tsx", ["title: \"Braivanta\"", "applicationName: \"Braivanta\""]);

const dashboard = source("src/app/(app)/dashboard/page.tsx");
check("dashboard no longer renders KPI stat cards", !dashboard.includes("function Stat(") && !dashboard.includes('label="Active tasks"'));

const uiFiles = [
  "src/app/layout.tsx",
  "src/app/login/page.tsx",
  "src/app/(app)/layout.tsx",
  "src/app/(app)/dashboard/page.tsx",
  "src/app/(app)/braille/page.tsx",
  "src/app/(app)/braille/new/page.tsx",
  "src/app/(app)/braille/[id]/page.tsx",
  "src/app/(app)/braille/[id]/review-workflow.tsx",
  "src/components/app-nav.tsx",
  "src/components/mobile-nav.tsx",
  "src/components/submission-workflow.tsx",
];
check(
  "user-facing Stage 1 surfaces contain no InsightEd branding",
  uiFiles.every((file) => !/insighted(?: ai)?/i.test(source(file))),
);

if (failures.length) {
  console.error(`\nStage 1 validation failed (${failures.length} failure${failures.length === 1 ? "" : "s"}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`\nStage 1 validation passed (${checks} checks)`);
