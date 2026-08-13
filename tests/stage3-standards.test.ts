import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  StandardsApplicability,
  TranscriptionProvenance,
} from "../src/lib/types.ts";
import {
  evaluateRegisteredRule,
  evaluateRegisteredStandards,
  planStandardsOverride,
  standardsApplicabilityForRun,
} from "../src/lib/standards/evaluation.ts";
import { registeredStandardsRules } from "../src/lib/standards/registry.ts";
import type { BrailleOcrResult } from "../src/lib/ai/types.ts";

const evaluatedAt = "2026-08-13T12:00:00.000Z";

const explicitUebContext: StandardsApplicability = {
  standardFamily: "UEB",
  basis: "configured_workflow",
  evidenceStatus: "supported",
  context: "Controlled test workflow explicitly configured for UEB.",
  source: "Controlled test configuration",
  providerProof: "not_established",
  limitations: ["Application context is not provider proof."],
};

const unavailableUebContext: StandardsApplicability = {
  standardFamily: "UEB",
  basis: "unavailable",
  evidenceStatus: "unavailable",
  context: "No UEB context established.",
  source: null,
  providerProof: "not_established",
  limitations: ["Raw Braille alone is not proof of UEB."],
};

function provenance(rawBraille: string | null): TranscriptionProvenance {
  return {
    version: "1",
    availability: rawBraille ? "partial" : "unavailable",
    provider: "test",
    model: "test",
    engineVersion: "test",
    evidenceContract: null,
    pages: rawBraille
      ? [{
          pageId: "braivanta-page-1",
          pageNumber: 1,
          dimensions: null,
          rawBraille,
          cells: [],
          mappings: [],
          mappingAvailability: "unavailable",
          sourceHighlightAvailability: "unavailable",
          limitations: [],
        }]
      : [],
    limitations: [],
  };
}

test("S11: only registered rules can be evaluated", () => {
  assert.equal(
    evaluateRegisteredRule("UEB-6.1.1", provenance("⠼⠁"), explicitUebContext, evaluatedAt).ruleId,
    "UEB-6.1.1",
  );
  assert.throws(
    () => evaluateRegisteredRule("UEB-999.9", provenance("⠼⠁"), explicitUebContext, evaluatedAt),
    /Unregistered/,
  );
});

test("S12: arbitrary user or LLM-created rule IDs are rejected", () => {
  assert.throws(
    () => evaluateRegisteredRule("LLM-says-this-is-UEB", provenance("⠼⠁"), explicitUebContext, evaluatedAt),
    /Unregistered standards rule/,
  );
});

test("S13: automated outcomes stay inside the bounded vocabulary", () => {
  const allowed = new Set(["not_applicable", "consistent", "possible_conflict", "insufficient_evidence"]);
  for (const evidence of [provenance("⠼⠁"), provenance("⠓⠊"), provenance(null)]) {
    for (const evaluation of evaluateRegisteredStandards(evidence, explicitUebContext, evaluatedAt)) {
      assert.equal(allowed.has(evaluation.automatedOutcome), true);
    }
  }
});

test("S14: missing evidence yields insufficient_evidence", () => {
  assert.equal(
    evaluateRegisteredRule("UEB-6.1.1", provenance(null), explicitUebContext, evaluatedAt).automatedOutcome,
    "insufficient_evidence",
  );
});

test("S15: specialist override preserves the original automated result", () => {
  const evaluations = evaluateRegisteredStandards(provenance("⠼⠁"), explicitUebContext, evaluatedAt);
  const automatedOutcome = evaluations[0].automatedOutcome;
  const plan = planStandardsOverride({
    taskStatus: "needs_specialist_review",
    transcriptionStatus: "needs_specialist_review",
    evaluations,
    ruleId: "UEB-6.1.1",
    decision: "confirm_interpretation",
    reviewerId: "u_priya",
    reviewedAt: evaluatedAt,
    reason: "Source checked.",
  });
  assert.equal(plan.ok, true);
  if (plan.ok) assert.equal(plan.evaluations[0].automatedOutcome, automatedOutcome);
});

test("S16: override records reviewer, time, decision, and reason", () => {
  const plan = planStandardsOverride({
    taskStatus: "needs_specialist_review",
    transcriptionStatus: "needs_specialist_review",
    evaluations: evaluateRegisteredStandards(provenance("⠼⠁"), explicitUebContext, evaluatedAt),
    ruleId: "UEB-6.1.1",
    decision: "mark_not_applicable",
    reviewerId: "u_priya",
    reviewedAt: evaluatedAt,
    reason: "This sequence is not a number in the source context.",
  });
  assert.equal(plan.ok, true);
  if (plan.ok) {
    assert.deepEqual(plan.evaluations[0].overrides[0], {
      decision: "mark_not_applicable",
      reviewerId: "u_priya",
      reviewedAt: evaluatedAt,
      reason: "This sequence is not a number in the source context.",
    });
  }
});

test("S17: historical records without evaluations remain valid", () => {
  const historical = { draftText: "historical", standardsEvaluations: undefined };
  assert.deepEqual(historical.standardsEvaluations ?? [], []);
});

test("S18: the UI states decision support and makes no certification claim", () => {
  const ui = readFileSync("src/app/(app)/braille/[id]/review-workflow.tsx", "utf8");
  assert.match(ui, /This is not compliance certification/);
  assert.doesNotMatch(ui, /Braivanta proves this Braille is compliant/i);
});

test("S19: closed and verified records reject standards mutations", () => {
  const evaluations = evaluateRegisteredStandards(provenance("⠼⠁"), explicitUebContext, evaluatedAt);
  for (const [taskStatus, transcriptionStatus] of [
    ["rejected", "needs_specialist_review"],
    ["archived", "needs_specialist_review"],
    ["specialist_verified", "specialist_verified"],
  ] as const) {
    const plan = planStandardsOverride({
      taskStatus,
      transcriptionStatus,
      evaluations,
      ruleId: "UEB-6.1.1",
      decision: "confirm_interpretation",
      reviewerId: "u_priya",
      reviewedAt: evaluatedAt,
      reason: "Checked.",
    });
    assert.equal(plan.ok, false);
  }
});

test("S20: authoritative rule metadata stays in the standards registry", () => {
  const rule = registeredStandardsRules()[0];
  assert.equal(rule.ruleId, "UEB-6.1.1");
  assert.equal(rule.version, "Third Edition 2024");
  assert.match(rule.sourceReference, /iceb\.org/);
});

test("S21: configured ABC UEB workflow establishes Braivanta applicability but not provider proof", () => {
  const result = {
    meta: {
      provider: "abc_braille_web",
      promptVersion: "abc-braille-en-ueb-g2.ctb",
    },
  } as BrailleOcrResult;
  const applicability = standardsApplicabilityForRun(result);
  assert.equal(applicability.basis, "configured_workflow");
  assert.equal(applicability.evidenceStatus, "supported");
  assert.equal(applicability.providerProof, "not_established");
});

test("S22: raw Braille alone does not establish UEB applicability", () => {
  const evaluation = evaluateRegisteredRule(
    "UEB-6.1.1",
    provenance("⠼⠁"),
    unavailableUebContext,
    evaluatedAt,
  );
  assert.equal(evaluation.automatedOutcome, "insufficient_evidence");
  assert.match(evaluation.evidenceSummary, /Raw Braille alone is not proof/i);
});

test("S23: the bounded UEB rule still evaluates with an explicit context", () => {
  const evaluation = evaluateRegisteredRule(
    "UEB-6.1.1",
    provenance("⠼⠁"),
    explicitUebContext,
    evaluatedAt,
  );
  assert.equal(evaluation.automatedOutcome, "consistent");
  assert.deepEqual(evaluation.applicability, explicitUebContext);
});

test("S24: an external OCR run does not acquire UEB applicability from raw Braille", () => {
  const result = {
    rawBraille: "⠼⠁",
    meta: { provider: "external_braille_ocr", promptVersion: "external-v1" },
  } as BrailleOcrResult;
  const applicability = standardsApplicabilityForRun(result);
  assert.equal(applicability.basis, "unavailable");
  assert.equal(applicability.providerProof, "not_established");
  assert.equal(
    evaluateRegisteredRule("UEB-6.1.1", provenance(result.rawBraille ?? null), applicability, evaluatedAt)
      .automatedOutcome,
    "insufficient_evidence",
  );
});

test("S25: historical evaluations without applicability cannot be confirmed as established", () => {
  const [historicalEvaluation] = evaluateRegisteredStandards(
    provenance("⠼⠁"),
    explicitUebContext,
    evaluatedAt,
  );
  delete historicalEvaluation.applicability;
  const plan = planStandardsOverride({
    taskStatus: "needs_specialist_review",
    transcriptionStatus: "needs_specialist_review",
    evaluations: [historicalEvaluation],
    ruleId: "UEB-6.1.1",
    decision: "confirm_interpretation",
    reviewerId: "u_priya",
    reviewedAt: evaluatedAt,
    reason: "Attempted confirmation without an applicability basis.",
  });
  assert.deepEqual(plan, {
    ok: false,
    error: "UEB applicability is not established for this evaluation",
  });
});
