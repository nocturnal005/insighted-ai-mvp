/** Stage 5 evidence defensibility and bounded longitudinal-record contract. */
import { existsSync, readFileSync } from "node:fs";

const checks = [
  ["explicit non-inferential evidence states exist", "src/lib/stage5-evidence.ts", '"not_recorded" | "unavailable" | "not_applicable"'],
  ["summary derives from persisted BrailleTask data", "src/lib/stage5-evidence.ts", "buildVerifiedEvidenceSummary(task: BrailleTask)"],
  ["verified-only history uses the established specialist gate", "src/lib/stage5-evidence.ts", "teacherVerifiedTranscriptionError(task) === null"],
  ["review counts derive from actual review items", "src/lib/stage5-evidence.ts", "items.filter((item) => item.reviewStatus"],
  ["current and historical corrections are explicitly partitioned", "src/lib/stage5-evidence.ts", "partitionCorrectionEvidence(evidence, runId)"],
  ["legacy evidence remains explicitly unscoped", "src/lib/stage5-evidence.ts", "legacyUnscoped"],
  ["summary omits raw source/provider/transcription content", "src/lib/stage5-evidence.ts", "provider payloads"],
  ["learner evidence route has a server permission guard", "src/app/(app)/pupils/[id]/evidence/page.tsx", 'can(user.role, "pupil.evidence.read")'],
  ["teaching assistants do not receive learner evidence aggregation permission", "src/lib/rbac.ts", 'teaching_assistant: ["task.create"'],
  ["teacher access is explicitly granted", "src/lib/rbac.ts", '"pupil.evidence.read"'],
  ["UI states no proficiency, progress, grade, or time-savings claim", "src/app/(app)/pupils/[id]/evidence/page.tsx", "does not calculate learner proficiency, progress, a predicted grade, or reviewer time savings"],
  ["UI labels categories as evidence, not learner conclusions", "src/app/(app)/pupils/[id]/evidence/page.tsx", "not conclusions about the learner"],
  ["capability map records unsupported claims", "docs/stage-5-evidence-defensibility-map.md", "Unsupported at Stage 5"],
  ["behavioural coverage exists", "tests/stage5-evidence-defensibility.test.ts", "S5-"],
  ["durable persistence coverage exists", "tests/stage5-evidence-defensibility.test.ts", "S5-20"],
  ["verifiedAt evidence preserves nullable status without fallback substitution", "src/lib/stage5-evidence.ts", "verifiedAt: summary.specialistVerification.verifiedAt,"],
  ["UI handles unrecorded verification timestamps truthfully", "src/app/(app)/pupils/[id]/evidence/page.tsx", '"verification time not recorded"'],
  ["regression coverage for FND-5-01 exists", "tests/stage5-evidence-defensibility.test.ts", "S5-21"],
];

let failures = 0;
for (const [label, file, needle] of checks) {
  const content = existsSync(file) ? readFileSync(file, "utf8") : "";
  const pass = content.includes(needle);
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${label}`);
  if (!pass) failures += 1;
}

const forbidden = ["proficiency score", "predicted grade", "progress percentage", "time-saving metric", "learner-fault", "specialistVerification.verifiedAt ?? summary.submittedAt"];
for (const needle of forbidden) {
  const content = readFileSync("src/lib/stage5-evidence.ts", "utf8");
  const pass = !content.includes(needle);
  console.log(`  [${pass ? "PASS" : "FAIL"}] no generated/fabricated ${needle}`);
  if (!pass) failures += 1;
}

const total = checks.length + forbidden.length;
if (failures) {
  console.error(`\nStage 5 validation failed (${failures}/${total} checks)`);
  process.exit(1);
}
console.log(`\nStage 5 evidence defensibility passed (${total} checks)`);
