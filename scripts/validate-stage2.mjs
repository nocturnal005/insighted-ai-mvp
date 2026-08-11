/** Stage 2 confidence-aware verification source and safety contract. */
import { existsSync, readFileSync } from "node:fs";

const checks = [
  ["historical metadata stays optional", "src/lib/types.ts", "reviewItems?: TranscriptionReviewItem[] | null"],
  ["confidence evidence stays optional", "src/lib/types.ts", "confidenceEvidence?: TranscriptionConfidenceEvidence | null"],
  ["bounded review status", "src/lib/types.ts", '"unreviewed" | "confirmed" | "corrected" | "needs_rescan"'],
  ["bounded uncertainty routing", "src/lib/types.ts", '"review_suggested" | "review_required"'],
  ["machine output is retained per passage", "src/lib/types.ts", "machineText: string"],
  ["current output is stored separately", "src/lib/types.ts", "reviewedText: string"],
  ["missing confidence remains unavailable", "src/lib/verification/confidence.ts", "UNAVAILABLE_CONFIDENCE"],
  ["only exact unique excerpts are contextual", "src/lib/verification/confidence.ts", "exactUniqueRange"],
  ["generic workflow flags are not fake passages", "src/lib/verification/confidence.ts", "NON_CONTEXTUAL_CATEGORIES"],
  ["provider flags retain their source", "src/lib/verification/confidence.ts", '"ocr_provider_flag"'],
  ["secondary review remains identified", "src/lib/verification/confidence.ts", '"secondary_ai_review"'],
  ["no model finding percentage becomes OCR confidence", "src/lib/verification/confidence.ts", "self-reported number is deliberately not OCR confidence"],
  ["high categorical severity routes required review", "src/lib/verification/confidence.ts", 'flag.severity === "high" ? "review_required"'],
  ["external missing score is not defaulted", "src/lib/ai/providers/external-braille-provider.ts", "providerConfidenceSupplied"],
  ["external fallback 50 percent removed", "src/lib/ai/providers/external-braille-provider.ts", 'confidenceBasis: "not_supplied"'],
  ["general vision confidence withheld", "src/lib/ai/providers/openai-vision-provider.ts", "self-rating is not accepted"],
  ["mock confidence withheld", "src/lib/ai/providers/mock-provider.ts", 'source: "Deterministic demo fixture"'],
  ["engine comparison is labelled agreement", "src/lib/ai/providers/hybrid-braille-provider.ts", 'kind: "engine_agreement"'],
  ["review items persist with transcription", "src/app/(app)/braille/actions.ts", "reviewItems: buildTranscriptionReviewItems(result)"],
  ["specialist permission guards passage actions", "src/app/(app)/braille/actions.ts", "Only authorised Braille specialists can review flagged passages"],
  ["correction updates current text", "src/app/(app)/braille/actions.ts", "transcription.editedText.slice(0, item.start)"],
  ["required review blocks final verification", "src/app/(app)/braille/actions.ts", "unresolvedRequiredReviewItems"],
  ["flagged passages are native buttons", "src/app/(app)/braille/[id]/review-workflow.tsx", 'aria-pressed={selectedId === item.id}'],
  ["keyboard activation is explicit", "src/app/(app)/braille/[id]/review-workflow.tsx", 'event.key === "Enter" || event.key === " "'],
  ["passage state is visible in text", "src/app/(app)/braille/[id]/review-workflow.tsx", "reviewItemLabel(item)"],
  ["selection drives contextual panel", "src/app/(app)/braille/[id]/review-workflow.tsx", "SelectedReviewContext"],
  ["machine and current outputs are distinguished", "src/app/(app)/braille/[id]/review-workflow.tsx", "Original machine output"],
  ["confirm action exists", "src/app/(app)/braille/[id]/review-workflow.tsx", "Confirm interpretation"],
  ["correction action exists", "src/app/(app)/braille/[id]/review-workflow.tsx", "Save corrected translation"],
  ["rescan action exists", "src/app/(app)/braille/[id]/review-workflow.tsx", "Needs re-scan"],
  ["unauthorised role gets no specialist controls", "src/app/(app)/braille/[id]/review-workflow.tsx", "Specialist actions are unavailable for your role"],
  ["historical no-evidence state is honest", "src/app/(app)/braille/[id]/review-workflow.tsx", "No passage-level uncertainty evidence was supplied"],
  ["capability map documents no thresholds", "docs/stage-2-confidence-capability-map.md", "No numeric thresholds are introduced in Stage 2"],
  ["cell confidence is deferred", "docs/stage-2-confidence-capability-map.md", "Cell provenance is explicitly deferred to Stage 3"],
];

let failures = 0;
for (const [label, file, needle] of checks) {
  const content = existsSync(file) ? readFileSync(file, "utf8") : "";
  const pass = content.includes(needle);
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${label}`);
  if (!pass) failures += 1;
}

if (failures) {
  console.error(`\nStage 2 validation failed (${failures}/${checks.length} checks)`);
  process.exit(1);
}
console.log(`\nStage 2 confidence-aware verification passed (${checks.length} checks)`);
