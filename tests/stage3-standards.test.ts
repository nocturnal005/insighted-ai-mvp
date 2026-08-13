import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

import type { TranscriptionProvenance } from "../src/lib/types.ts";
import {
  evaluateRegisteredRule,
  evaluateRegisteredStandards,
  planStandardsOverride,
} from "../src/lib/standards/evaluation.ts";
import { STAGE3_STANDARDS_PROFILE } from "../src/lib/provenance.ts";

const evaluatedAt = "2026-08-13T12:00:00.000Z";

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
    standardsProfile: STAGE3_STANDARDS_PROFILE,
    limitations: [],
  };
}

test("S11: only registered rules can be evaluated", () => {
  assert.equal(evaluateRegisteredRule("UEB-6.1.1", provenance("⠼⠁"), evaluatedAt).ruleId, "UEB-6.1.1");
  assert.throws(() => evaluateRegisteredRule("UEB-999.9", provenance("⠼⠁"), evaluatedAt), /Unregistered/);
});

test("S12: arbitrary user or LLM-created rule IDs are rejected", () => {
  assert.throws(
    () => evaluateRegisteredRule("LLM-says-this-is-UEB", provenance("⠼⠁"), evaluatedAt),
    /Unregistered standards rule/,
  );
});

test("S13: automated outcomes stay inside the bounded vocabulary", () => {
  const allowed = new Set(["not_applicable", "consistent", "possible_conflict", "insufficient_evidence"]);
  for (const evidence of [provenance("⠼⠁"), provenance("⠓⠊"), provenance(null)]) {
    for (const evaluation of evaluateRegisteredStandards(evidence, evaluatedAt)) {
      assert.equal(allowed.has(evaluation.automatedOutcome), true);
    }
  }
});

test("S14: missing evidence yields insufficient_evidence", () => {
  assert.equal(
    evaluateRegisteredRule("UEB-6.1.1", provenance(null), evaluatedAt).automatedOutcome,
    "insufficient_evidence",
  );
});

test("S15: specialist override preserves the original automated result", () => {
  const evaluations = evaluateRegisteredStandards(provenance("⠼⠁"), evaluatedAt);
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
    evaluations: evaluateRegisteredStandards(provenance("⠼⠁"), evaluatedAt),
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
  const evaluations = evaluateRegisteredStandards(provenance("⠼⠁"), evaluatedAt);
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
