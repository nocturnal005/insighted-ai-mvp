/**
 * Stage 2 — what becomes a contextual passage, and what must not.
 *
 * These are behavioural, not source-string, checks: each one builds a provider result and
 * asserts what the product actually derives from it. Independent review asked for exactly
 * that, because a source grep cannot tell you which of two overlapping candidates wins.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildTranscriptionReviewItems,
  buildUnmappedHighPriorityIssues,
} from "../src/lib/verification/confidence.ts";
import type { BrailleOcrResult, UncertaintyFlag } from "../src/lib/ai/types.ts";

function hybridResult(overrides: Partial<BrailleOcrResult> = {}): BrailleOcrResult {
  return {
    draftText: "the cat sat on the mat",
    confidence: 0,
    confidenceBasis: "consensus",
    flags: [],
    review: null,
    meta: {
      provider: "abc_openai_review",
      model: "test-model",
      engineVersion: "test",
      promptVersion: "test",
      mode: "real",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      processingMs: 1000,
    },
    requiresSpecialistReview: true,
    ...overrides,
  } as BrailleOcrResult;
}

function flag(overrides: Partial<UncertaintyFlag> = {}): UncertaintyFlag {
  return {
    id: "flag-1",
    text: "sat",
    reason: "Engine disagreement on this word.",
    category: "engine_disagreement",
    severity: "high",
    ...overrides,
  } as UncertaintyFlag;
}

// ===========================================================================
// Correction 4 — structured hybrid evidence must beat its derived duplicate
// ===========================================================================
test("C4: structured secondary evidence wins over the derived flag covering the same text", () => {
  /**
   * This is the exact shape the hybrid provider produces. `disagreementFlags` derives a
   * flag per discrepancy, so with lineNumber = null the flag's text IS the discrepancy's
   * sourceText and both candidates resolve to the same character range. The derived flag
   * carries no suggestion; the structured discrepancy does. The richer one must survive.
   */
  const result = hybridResult({
    flags: [
      flag({
        text: "sat",
        reason: "Contraction may be misread. Suggested reading: “sate”.",
        category: "possible_contraction_issue",
      }),
    ],
    review: {
      status: "completed",
      summary: "One discrepancy.",
      discrepancies: [
        {
          lineNumber: null,
          sourceText: "sat",
          suggestedText: "sate",
          issueType: "contraction",
          reason: "Contraction may be misread.",
          severity: "high",
          confidence: 0.8,
        },
      ],
      rawBraille: null,
      liblouisText: null,
      liblouisAvailable: false,
      primaryLiblouisAgreement: 0.9,
      reviewImageCount: 1,
      model: "test-model",
      processingMs: 10,
    },
  });

  const items = buildTranscriptionReviewItems(result);

  assert.equal(items.length, 1, "the duplicated evidence produced more than one passage");
  const [item] = items;
  assert.equal(
    item.evidenceSource,
    "secondary_ai_review",
    "structured secondary evidence was replaced by its derived flag representation",
  );
  assert.equal(
    item.alternativeText,
    "sate",
    "the surviving candidate lost the suggested reading only the structured evidence carries",
  );
  assert.equal(item.machineText, "sat");
  assert.equal(item.reviewedText, "sat");
});

test("C4: a derived hybrid flag with no structured twin is still attributed to the secondary review", () => {
  // Provenance must be honest in both directions: when the structured discrepancy cannot
  // be mapped but its derived flag can, the surviving item is still secondary evidence
  // and must not be mislabelled as a general vision flag.
  const result = hybridResult({
    draftText: "line one\nthe cat sat on the mat",
    flags: [flag({ text: "cat", reason: "Possible capitalisation issue." })],
    review: {
      status: "completed",
      summary: "One discrepancy.",
      discrepancies: [
        {
          // Line 9 does not exist, so lineRange refuses and only the flag maps.
          lineNumber: 9,
          sourceText: "cat",
          suggestedText: "Cat",
          issueType: "capitalisation",
          reason: "Possible capitalisation issue.",
          severity: "high",
          confidence: 0.7,
        },
      ],
      rawBraille: null,
      liblouisText: null,
      liblouisAvailable: false,
      primaryLiblouisAgreement: null,
      reviewImageCount: 1,
      model: "test-model",
      processingMs: 10,
    },
  });

  const items = buildTranscriptionReviewItems(result);
  assert.equal(items.length, 1);
  assert.equal(items[0].evidenceSource, "secondary_ai_review");
});

test("C4: ordering is deterministic across input order", () => {
  // Same evidence, flags supplied in the opposite order, identical output.
  const base = {
    draftText: "alpha bravo charlie",
    review: null,
  };
  const forward = hybridResult({
    ...base,
    flags: [
      flag({ id: "a", text: "alpha", severity: "low", reason: "A." }),
      flag({ id: "c", text: "charlie", severity: "high", reason: "C." }),
    ],
  });
  const reverse = hybridResult({
    ...base,
    flags: [
      flag({ id: "c", text: "charlie", severity: "high", reason: "C." }),
      flag({ id: "a", text: "alpha", severity: "low", reason: "A." }),
    ],
  });

  const forwardRanges = buildTranscriptionReviewItems(forward).map((i) => [i.start, i.end]);
  const reverseRanges = buildTranscriptionReviewItems(reverse).map((i) => [i.start, i.end]);
  assert.deepEqual(forwardRanges, reverseRanges);
  assert.deepEqual(forwardRanges, [
    [0, 5],
    [12, 19],
  ]);
});

// ===========================================================================
// Correction 6 — unmappable high-priority issues survive without a guessed range
// ===========================================================================
test("C6: a high-severity flag whose excerpt occurs twice creates no passage and no guessed range", () => {
  const result = hybridResult({
    draftText: "the cat sat on the mat and the cat sat again",
    flags: [
      flag({
        id: "repeat",
        // "the cat sat" appears twice, so no unique anchor exists.
        text: "the cat sat",
        reason: "Repeated phrase may be a duplicated line.",
        category: "line_order_uncertainty",
        severity: "high",
      }),
    ],
  });

  const items = buildTranscriptionReviewItems(result);
  assert.deepEqual(items, [], "an ambiguous excerpt was given a guessed contextual highlight");

  const issues = buildUnmappedHighPriorityIssues(result);
  assert.deepEqual(
    issues,
    ["Repeated phrase may be a duplicated line."],
    "the high-priority reason disappeared when it could not be mapped",
  );
});

test("C6: generic workflow flags never appear as additional issues", () => {
  const result = hybridResult({
    flags: [
      flag({
        id: "workflow",
        text: "whole document",
        reason: "Braille OCR output always requires specialist review.",
        category: "requires_specialist_review",
        severity: "high",
      }),
    ],
  });

  assert.deepEqual(buildTranscriptionReviewItems(result), []);
  assert.deepEqual(
    buildUnmappedHighPriorityIssues(result),
    [],
    "the universal specialist-review marker was surfaced as if it were a specific finding",
  );
});

test("C6: medium-severity unmappable evidence is not escalated", () => {
  const result = hybridResult({
    draftText: "the cat sat and the cat sat",
    flags: [flag({ id: "m", text: "the cat sat", severity: "medium", reason: "Might be duplicated." })],
  });
  assert.deepEqual(buildUnmappedHighPriorityIssues(result), []);
});
