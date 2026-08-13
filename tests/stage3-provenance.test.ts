import { test } from "node:test";
import assert from "node:assert/strict";

import { redactPrivateBrailleProvenance } from "../src/lib/ai/provider-visibility.ts";
import type { BrailleOcrResult } from "../src/lib/ai/types.ts";
import {
  buildTranscriptionProvenance,
  sourceEvidenceForReview,
} from "../src/lib/provenance.ts";
import { evaluateRegisteredStandards, planStandardsOverride } from "../src/lib/standards/evaluation.ts";
import type { BrailleTask, StandardsApplicability } from "../src/lib/types.ts";

const completedAt = "2026-08-13T12:00:00.000Z";
const explicitUebContext: StandardsApplicability = {
  standardFamily: "UEB",
  basis: "configured_workflow",
  evidenceStatus: "supported",
  context: "Controlled UEB test workflow.",
  source: "Controlled test configuration",
  providerProof: "not_established",
  limitations: ["Not provider proof."],
};

function result(
  provider: string,
  overrides: Partial<BrailleOcrResult> = {},
): BrailleOcrResult {
  return {
    draftText: "1",
    confidence: 0,
    confidenceBasis: "not_supplied",
    flags: [],
    rawBraille: null,
    rawCells: null,
    meta: {
      provider,
      model: "test-model",
      engineVersion: "test-engine",
      promptVersion: "test-prompt",
      mode: "real",
      startedAt: "2026-08-13T11:59:59.000Z",
      completedAt,
      processingMs: 1000,
    },
    requiresSpecialistReview: true,
    ...overrides,
  } as BrailleOcrResult;
}

const supportedCell = {
  line: 1,
  cellIndex: 1,
  dots: [3, 4, 5, 6],
  bbox: [10, 20, 30, 50],
  confidence: 0.82,
};

test("P1: unsupported provenance remains unavailable", () => {
  const provenance = buildTranscriptionProvenance(result("openai"));
  assert.equal(provenance.availability, "unavailable");
  assert.deepEqual(provenance.pages, []);
});

test("P2: historical records without provenance still produce an honest view", () => {
  assert.deepEqual(sourceEvidenceForReview(undefined), {
    availability: "unavailable",
    rawBraille: null,
    cells: [],
    mappings: [],
    sourceHighlight: null,
    limitation: "Source-level provenance is unavailable for this OCR path.",
  });
});

test("P3: provider working-image coordinates never generate a source highlight", () => {
  const provenance = buildTranscriptionProvenance(
    result("external_braille_ocr", {
      rawBraille: "⠼⠁",
      rawCells: [supportedCell],
      pageResults: [{ pageNumber: 1, text: "1", confidence: 0.8, flags: [] }],
    }),
  );
  const view = sourceEvidenceForReview(provenance);
  assert.equal(view.sourceHighlight, null);
  assert.equal(view.cells[0].boundingBox.sourceImageAligned, false);
});

test("P4: raw Braille without mappings is presented as page-level evidence", () => {
  const provenance = buildTranscriptionProvenance(
    result("abc_braille_web", { rawBraille: "⠼⠁", rawCells: null }),
  );
  const view = sourceEvidenceForReview(provenance);
  assert.equal(view.rawBraille, "⠼⠁");
  assert.deepEqual(view.mappings, []);
  assert.match(view.limitation, /no exact mapping to this English passage/i);
});

test("P5: external cell evidence cannot leak into another provider path", () => {
  const external = buildTranscriptionProvenance(
    result("external_braille_ocr", {
      rawBraille: "⠼⠁",
      rawCells: [supportedCell],
      pageResults: [{ pageNumber: 1, text: "1", confidence: 0.8, flags: [] }],
    }),
  );
  const abc = buildTranscriptionProvenance(
    result("abc_braille_web", { rawBraille: "⠼⠁", rawCells: [supportedCell] }),
  );
  assert.equal(external.pages[0].cells.length, 1);
  assert.deepEqual(abc.pages[0].cells, []);
});

test("P6: Braivanta cell IDs are distinguishable from provider IDs", () => {
  const provenance = buildTranscriptionProvenance(
    result("external_braille_ocr", {
      rawBraille: "⠼⠁",
      rawCells: [supportedCell],
      pageResults: [{ pageNumber: 1, text: "1", confidence: 0.8, flags: [] }],
    }),
  );
  const cell = provenance.pages[0].cells[0];
  assert.match(cell.braivantaCellId, /^braivanta-cell-/);
  assert.equal(cell.providerCellId, null);
});

test("P7: transcription provenance contains only provider/run evidence", () => {
  const provenance = buildTranscriptionProvenance(
    result("external_braille_ocr", {
      rawBraille: "⠼⠁",
      rawCells: [supportedCell],
      pageResults: [{ pageNumber: 1, text: "1", confidence: 0.8, flags: [] }],
    }),
  );
  assert.equal("standardsProfile" in provenance, false);
  assert.equal(provenance.provider, "external_braille_ocr");
});

test("P8: a specialist standards decision preserves original machine evidence", () => {
  const provenance = buildTranscriptionProvenance(
    result("abc_braille_web", { rawBraille: "⠼⠁" }),
  );
  const evaluations = evaluateRegisteredStandards(provenance, explicitUebContext, completedAt);
  const original = structuredClone({ provenance, evaluation: evaluations[0] });
  const plan = planStandardsOverride({
    taskStatus: "needs_specialist_review",
    transcriptionStatus: "needs_specialist_review",
    evaluations,
    ruleId: "UEB-6.1.1",
    decision: "confirm_interpretation",
    reviewerId: "u_priya",
    reviewedAt: completedAt,
    reason: "Checked against the source Braille.",
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(provenance, original.provenance);
  if (plan.ok) assert.equal(plan.evaluations[0].automatedOutcome, original.evaluation.automatedOutcome);
});

test("P9: ambiguous cell-to-English mappings are never guessed", () => {
  const provenance = buildTranscriptionProvenance(
    result("external_braille_ocr", {
      rawBraille: "⠼⠁",
      rawCells: [supportedCell],
      pageResults: [{ pageNumber: 1, text: "1", confidence: 0.8, flags: [] }],
    }),
  );
  assert.deepEqual(provenance.pages[0].mappings, []);
  assert.equal(provenance.pages[0].mappingAvailability, "unavailable");
});

test("P10: source evidence is removed from a non-specialist client view", () => {
  const provenance = buildTranscriptionProvenance(result("abc_braille_web", { rawBraille: "⠼⠁" }));
  const task = {
    id: "bt-test",
    transcription: {
      aiProvider: "abc_braille_web",
      provenance,
      standardsEvaluations: evaluateRegisteredStandards(provenance, explicitUebContext, completedAt),
    },
  } as unknown as BrailleTask;
  const hidden = redactPrivateBrailleProvenance(task, { includeSourceEvidence: false });
  const specialist = redactPrivateBrailleProvenance(task, { includeSourceEvidence: true });
  assert.equal(hidden.transcription?.provenance, null);
  assert.equal(hidden.transcription?.standardsEvaluations, null);
  assert.equal(specialist.transcription?.provenance?.pages[0].rawBraille, "⠼⠁");
  assert.equal(specialist.transcription?.provenance?.provider, null, "private provider identity leaked");
});
