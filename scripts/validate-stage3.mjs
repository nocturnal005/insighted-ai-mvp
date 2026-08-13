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
  ["automated outcome is immutable during override", "src/lib/standards/evaluation.ts", "...evaluation.overrides"],
  ["specialist reason is required", "src/lib/standards/evaluation.ts", "A specialist reason is required"],
  ["closed tasks remain immutable", "src/lib/standards/evaluation.ts", "This task is closed and cannot be changed"],
  ["specialist action has a server guard", "src/app/(app)/braille/actions.ts", "Only authorised Braille specialists can record standards decisions"],
  ["provenance persists on the complete task JSON", "src/app/(app)/braille/actions.ts", "provenance,"],
  ["source evidence uses progressive disclosure", "src/app/(app)/braille/[id]/review-workflow.tsx", "View source evidence"],
  ["no fake highlight is disclosed", "src/app/(app)/braille/[id]/review-workflow.tsx", "no source-image highlight has been generated"],
  ["UI disclaims certification", "src/app/(app)/braille/[id]/review-workflow.tsx", "This is not compliance certification"],
  ["non-specialist client evidence is stripped", "src/app/(app)/braille/[id]/page.tsx", "includeSourceEvidence: canViewSourceEvidence"],
  ["capability audit exists", "docs/stage-3-provenance-capability-map.md", "## Capability matrix"],
];

let failures = 0;
for (const [label, file, needle] of checks) {
  const content = existsSync(file) ? readFileSync(file, "utf8") : "";
  const pass = content.includes(needle);
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${label}`);
  if (!pass) failures += 1;
}

if (failures) {
  console.error(`\nStage 3 validation failed (${failures}/${checks.length} checks)`);
  process.exit(1);
}
console.log(`\nStage 3 provenance and standards verification passed (${checks.length} checks)`);
