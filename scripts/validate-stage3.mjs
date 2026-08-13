/** Stage 3 provenance and standards-constrained verification source contract. */
import { existsSync, readFileSync } from "node:fs";

const checks = [
  ["historical provenance remains optional", "src/lib/types.ts", "provenance?: TranscriptionProvenance | null"],
  ["historical standards results remain optional", "src/lib/types.ts", "standardsEvaluations?: StandardRuleEvaluation[] | null"],
  ["Braivanta and provider cell IDs are separate", "src/lib/types.ts", "providerCellId: string | null"],
  ["provider boxes are not source aligned", "src/lib/types.ts", "sourceImageAligned: false"],
  ["unsupported mappings are structurally empty", "src/lib/types.ts", "mappings: []"],
  ["external cells have a strict runtime schema", "src/lib/provenance.ts", "const rawCellSchema = z"],
  ["provider paths are isolated", "src/lib/provenance.ts", "result.meta.provider !== EXTERNAL_PROVIDER"],
  ["missing source evidence is explicit", "src/lib/provenance.ts", "Source-level provenance is unavailable for this OCR path"],
  ["source highlight cannot be manufactured", "src/lib/provenance.ts", "sourceHighlight: null"],
  ["only registered rules evaluate", "src/lib/standards/registry.ts", "Unregistered standards rule"],
  ["UEB rule is versioned", "src/lib/standards/registry.ts", 'ruleId: "UEB-6.1.1"'],
  ["ICEB source is recorded", "src/lib/standards/registry.ts", "Rules%20of%20Unified%20English%20Braille%202024.pdf"],
  ["outcome vocabulary is bounded", "src/lib/types.ts", '"insufficient_evidence"'],
  ["evaluation applicability is structurally separate", "src/lib/types.ts", "applicability?: StandardsApplicability"],
  ["configured workflow is an explicit applicability basis", "src/lib/standards/evaluation.ts", 'basis: "configured_workflow"'],
  ["raw Braille is not UEB provider proof", "src/lib/standards/evaluation.ts", "Raw Braille alone is not proof that the provider used UEB"],
  ["provider proof is not established by decision support", "src/lib/standards/evaluation.ts", 'providerProof: "not_established"'],
  ["automated outcome is immutable during override", "src/lib/standards/evaluation.ts", "...evaluation.overrides"],
  ["specialist reason is required", "src/lib/standards/evaluation.ts", "A specialist reason is required"],
  ["closed tasks remain immutable", "src/lib/standards/evaluation.ts", "This task is closed and cannot be changed"],
  ["specialist action has a server guard", "src/app/(app)/braille/actions.ts", "Only authorised Braille specialists can record standards decisions"],
  ["provenance persists on the complete task JSON", "src/app/(app)/braille/actions.ts", "provenance,"],
  ["source evidence uses progressive disclosure", "src/app/(app)/braille/[id]/review-workflow.tsx", "View source evidence"],
  ["no fake highlight is disclosed", "src/app/(app)/braille/[id]/review-workflow.tsx", "no source-image highlight has been generated"],
  ["UI disclaims certification", "src/app/(app)/braille/[id]/review-workflow.tsx", "This is not compliance certification"],
  ["UI labels evaluation context", "src/app/(app)/braille/[id]/review-workflow.tsx", "Evaluation context"],
  ["UI separates provider standards proof", "src/app/(app)/braille/[id]/review-workflow.tsx", "Provider standards proof"],
  ["non-specialist client evidence is stripped", "src/app/(app)/braille/[id]/page.tsx", "includeSourceEvidence: canViewSourceEvidence"],
  ["capability audit exists", "docs/stage-3-provenance-capability-map.md", "## Capability matrix"],
  ["audit separates registry from provider provenance", "docs/stage-3-provenance-capability-map.md", "decision-support registry is not provider/run provenance"],
  ["durable test uses the production persistence function", "tests/stage3-durable-persistence.test.ts", "await persistBrailleTask(task)"],
  ["durable test reloads through production hydration", "tests/stage3-durable-persistence.test.ts", "await hydrateBrailleTask(taskId)"],
  ["durable test preserves automated outcome", "tests/stage3-durable-persistence.test.ts", "persistedEvaluation?.automatedOutcome"],
];

const exclusions = [
  ["transcription provenance does not contain a standards profile", "src/lib/types.ts", "standardsProfile:"],
  ["provenance builder does not inject a standards profile", "src/lib/provenance.ts", "STAGE3_STANDARDS_PROFILE"],
];

let failures = 0;
for (const [label, file, needle] of checks) {
  const content = existsSync(file) ? readFileSync(file, "utf8") : "";
  const pass = content.includes(needle);
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${label}`);
  if (!pass) failures += 1;
}

for (const [label, file, needle] of exclusions) {
  const content = existsSync(file) ? readFileSync(file, "utf8") : "";
  const pass = !content.includes(needle);
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${label}`);
  if (!pass) failures += 1;
}

if (failures) {
  console.error(`\nStage 3 validation failed (${failures}/${checks.length + exclusions.length} checks)`);
  process.exit(1);
}
console.log(`\nStage 3 provenance and standards verification passed (${checks.length + exclusions.length} checks)`);
