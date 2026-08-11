/** Stage 2 confidence-aware verification source and safety contract. */
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const checks = [
  ["historical metadata stays optional", "src/lib/types.ts", "reviewItems?: TranscriptionReviewItem[] | null"],
  ["unmappable issue metadata stays optional", "src/lib/types.ts", "additionalReviewIssues?: string[] | null"],
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
  ["review items persist with transcription", "src/app/(app)/braille/actions.ts", "const reviewItems = buildTranscriptionReviewItems(result)"],
  ["unmappable high-priority issues persist", "src/app/(app)/braille/actions.ts", "buildUnmappedHighPriorityIssues(result)"],
  ["whole-document edits remap marked passages", "src/app/(app)/braille/actions.ts", "remapReviewItemsAfterWholeDocumentEdit"],
  ["specialist permission guards passage actions", "src/app/(app)/braille/actions.ts", "Only authorised Braille specialists can review flagged passages"],
  ["closed tasks are guarded server-side", "src/lib/verification/review-guards.ts", "CLOSED_TASK_STATUSES"],
  ["corrected passages cannot be relabelled confirmed", "src/lib/verification/review-guards.ts", "A corrected passage cannot be confirmed"],
  ["correction updates current text", "src/lib/verification/review-guards.ts", "request.editedText.slice(0, item.start)"],
  ["required review blocks final verification", "src/app/(app)/braille/actions.ts", "unresolvedRequiredReviewItems"],
  ["flagged passages are native buttons", "src/app/(app)/braille/[id]/review-workflow.tsx", 'aria-pressed={selectedId === item.id}'],
  ["keyboard activation is explicit", "src/app/(app)/braille/[id]/review-workflow.tsx", 'event.key === "Enter" || event.key === " "'],
  ["passage state is visible in text", "src/app/(app)/braille/[id]/review-workflow.tsx", "reviewItemLabel(item)"],
  ["selection drives contextual panel", "src/app/(app)/braille/[id]/review-workflow.tsx", "SelectedReviewContext"],
  ["machine and current outputs are distinguished", "src/app/(app)/braille/[id]/review-workflow.tsx", "Original machine output"],
  ["confirm action names the machine interpretation", "src/app/(app)/braille/[id]/review-workflow.tsx", "Confirm machine interpretation"],
  ["full transcription fallback uses progressive disclosure", "src/app/(app)/braille/[id]/review-workflow.tsx", "Edit full transcription"],
  ["unmappable issues remain visible without a guessed range", "src/app/(app)/braille/[id]/review-workflow.tsx", "Additional review issues"],
  ["correction action exists", "src/app/(app)/braille/[id]/review-workflow.tsx", "Save corrected translation"],
  ["rescan action exists", "src/app/(app)/braille/[id]/review-workflow.tsx", "Needs re-scan"],
  ["unauthorised role gets no specialist controls", "src/app/(app)/braille/[id]/review-workflow.tsx", "Specialist actions are unavailable for your role"],
  ["historical no-evidence state is honest", "src/app/(app)/braille/[id]/review-workflow.tsx", "No passage-level uncertainty evidence was supplied"],
  ["capability map documents no thresholds", "docs/stage-2-confidence-capability-map.md", "No numeric thresholds are introduced in Stage 2"],
  ["cell confidence is deferred", "docs/stage-2-confidence-capability-map.md", "Cell provenance is explicitly deferred to Stage 3"],
  ["quality stores only provider document scores", "src/app/(app)/quality/actions.ts", "providerDocumentConfidence(r.confidenceEvidence)"],
  ["quality names provider score explicitly", "src/app/(app)/quality/page.tsx", "Average provider document score"],
  ["quality labels engine agreement separately", "src/app/(app)/quality/page.tsx", "Engine agreement"],
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

async function loadTypeScriptModule(file) {
  const source = readFileSync(file, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

function behaviour(label, pass) {
  behaviourChecks += 1;
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${label}`);
  if (!pass) failures += 1;
}

let behaviourChecks = 0;

const confidence = await loadTypeScriptModule("src/lib/verification/confidence.ts");
const quality = await loadTypeScriptModule("src/lib/quality-confidence.ts");
const reviewGuards = await loadTypeScriptModule("src/lib/verification/review-guards.ts");

const duplicateHybridResult = {
  draftText: "start unique hybrid phrase end",
  flags: [{
    id: "derived",
    text: "unique hybrid phrase",
    reason: "Structured discrepancy reason. Suggested reading: alternative.",
    category: "engine_disagreement",
    severity: "high",
  }],
  review: {
    discrepancies: [{
      lineNumber: null,
      sourceText: "unique hybrid phrase",
      suggestedText: "alternative hybrid phrase",
      issueType: "word",
      reason: "Structured discrepancy reason.",
      severity: "high",
    }],
  },
  meta: { provider: "abc_openai_review" },
};
const hybridItems = confidence.buildTranscriptionReviewItems(duplicateHybridResult);
behaviour(
  "structured hybrid evidence wins an exact duplicate range",
  hybridItems.length === 1 &&
    hybridItems[0].evidenceSource === "secondary_ai_review" &&
    hybridItems[0].alternativeText === "alternative hybrid phrase",
);

const repeatedText = "repeat issue here then repeat issue here";
const unmappableResult = {
  draftText: repeatedText,
  flags: [
    { id: "substantive", text: "repeat issue", reason: "Repeated substantive OCR issue", category: "low_ocr_confidence", severity: "high" },
    { id: "generic", text: "Review required", reason: "Universal workflow marker", category: "requires_specialist_review", severity: "high" },
  ],
  meta: { provider: "external_braille_ocr" },
};
const unmappableItems = confidence.buildTranscriptionReviewItems(unmappableResult);
const unmappableReasons = confidence.buildUnmappedHighPriorityIssues(unmappableResult);
behaviour("ambiguous repeated text creates no guessed review range", unmappableItems.length === 0);
behaviour(
  "unmappable substantive reason survives without the generic workflow marker",
  unmappableReasons.length === 1 && unmappableReasons[0] === "Repeated substantive OCR issue",
);

const originalText = "plain prefix flagged phrase suffix";
const originalItem = {
  id: "item-1",
  start: originalText.indexOf("flagged phrase"),
  end: originalText.indexOf("flagged phrase") + "flagged phrase".length,
  machineText: "flagged phrase",
  reviewedText: "flagged phrase",
  uncertaintyState: "review_required",
  reviewStatus: "confirmed",
  category: "low_ocr_confidence",
  severity: "high",
  reason: "Needs review",
  evidenceSource: "ocr_provider_flag",
  confidence: null,
  confidenceSource: null,
  alternativeText: null,
  reviewerNote: "kept",
  reviewedBy: "u_priya",
  reviewedAt: "2026-08-11T00:00:00.000Z",
};
const wholeEdit = "carefully checked plain prefix flagged phrase suffix";
const remapped = confidence.remapReviewItemsAfterWholeDocumentEdit(originalText, wholeEdit, [originalItem]);
behaviour(
  "unflagged whole-document edit preserves status, machine text, and updates offsets",
  remapped[0].start === wholeEdit.indexOf("flagged phrase") &&
    remapped[0].reviewStatus === "confirmed" &&
    remapped[0].machineText === "flagged phrase" &&
    remapped[0].reviewerNote === "kept",
);
let flaggedEditRejected = false;
try {
  confidence.remapReviewItemsAfterWholeDocumentEdit(originalText, originalText.replace("flagged phrase", "changed flag"), [originalItem]);
} catch {
  flaggedEditRejected = true;
}
behaviour("whole-document editor rejects a marked-passage change", flaggedEditRejected);

const hybridSampleConfidence = quality.providerDocumentConfidence({
  availability: "available",
  value: 0.9,
  kind: "engine_agreement",
});
const providerAverage = quality.averageProviderDocumentConfidence([
  { confidence: hybridSampleConfidence, confidenceEvidenceKind: "engine_agreement" },
  { confidence: 0.8, confidenceEvidenceKind: "provider_score" },
]);
behaviour("0.90 hybrid engine agreement does not populate EvalSample.confidence", hybridSampleConfidence === null);
behaviour("hybrid agreement does not contribute to average provider confidence", providerAverage === 0.8);

const reviewRequest = {
  taskStatus: "needs_specialist_review",
  transcriptionStatus: "needs_specialist_review",
  editedText: originalText,
  items: [originalItem],
  itemId: originalItem.id,
  nextStatus: "confirmed",
  submittedText: originalItem.machineText,
  reviewerNote: "",
  reviewedBy: "u_priya",
  reviewedAt: "2026-08-11T00:00:00.000Z",
};
const confirmedPlan = reviewGuards.planReviewItemMutation(reviewRequest);
behaviour("machine text can transition to confirmed", confirmedPlan.ok && confirmedPlan.items[0].reviewStatus === "confirmed");

const correctedPlan = reviewGuards.planReviewItemMutation({
  ...reviewRequest,
  nextStatus: "corrected",
  submittedText: "human corrected phrase",
});
const confirmCorrectedPlan = correctedPlan.ok
  ? reviewGuards.planReviewItemMutation({
      ...reviewRequest,
      editedText: correctedPlan.editedText,
      items: correctedPlan.items,
      submittedText: "human corrected phrase",
    })
  : correctedPlan;
behaviour(
  "corrected text cannot transition to confirmed without restoration",
  correctedPlan.ok && !confirmCorrectedPlan.ok,
);

for (const taskStatus of ["rejected", "archived"]) {
  for (const nextStatus of ["confirmed", "corrected", "needs_rescan"]) {
    const closedPlan = reviewGuards.planReviewItemMutation({ ...reviewRequest, taskStatus, nextStatus });
    behaviour(`${taskStatus} task rejects ${nextStatus}`, !closedPlan.ok && closedPlan.error.includes("closed"));
  }
}

if (failures) {
  console.error(`\nStage 2 validation failed (${failures} check(s))`);
  process.exit(1);
}
console.log(`\nStage 2 confidence-aware verification passed (${checks.length + behaviourChecks} checks)`);
