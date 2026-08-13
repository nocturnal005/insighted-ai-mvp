/**
 * Stage 2 — Correction 2. A specialist must still be able to fix what the machine
 * never flagged.
 *
 * Stage 2 originally refused every whole-document edit once any contextual review item
 * existed. That is unsafe: an OCR error the machine did not notice is precisely the error
 * a human is there to catch. The rule is not "no whole-document edits", it is "marked
 * passages keep their evidence" — so unflagged text may be edited freely, and a change to
 * a marked passage is refused with an instruction to use its contextual control.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { remapReviewItemsAfterWholeDocumentEdit } from "../src/lib/verification/confidence.ts";
import type { TranscriptionReviewItem } from "../src/lib/types.ts";

const DRAFT = "the cat sat on the mat and the dog barked loudly";

function item(overrides: Partial<TranscriptionReviewItem> = {}): TranscriptionReviewItem {
  const start = overrides.start ?? 4;
  const machineText = overrides.machineText ?? "cat";
  return {
    id: "review-1",
    start,
    end: start + machineText.length,
    machineText,
    reviewedText: overrides.reviewedText ?? machineText,
    uncertaintyState: "review_required",
    reviewStatus: "unreviewed",
    category: "engine_disagreement",
    severity: "high",
    reason: "Engine disagreement.",
    evidenceSource: "secondary_ai_review",
    confidence: null,
    confidenceSource: null,
    alternativeText: null,
    reviewerNote: "",
    reviewedBy: null,
    reviewedAt: null,
    ...overrides,
  };
}

test("C2: editing only unflagged text succeeds and re-anchors the marked passage", () => {
  const items = [item()]; // "cat" at 4..7
  // The specialist fixes "barked" → "barks": machine never flagged it.
  const submitted = "the cat sat on the mat and the dog barks loudly";

  const remapped = remapReviewItemsAfterWholeDocumentEdit(DRAFT, submitted, items);

  assert.equal(remapped.length, 1);
  assert.equal(submitted.slice(remapped[0].start, remapped[0].end), "cat", "the passage no longer maps to its text");
  assert.equal(remapped[0].machineText, "cat", "machine output was altered by a document edit");
  assert.equal(remapped[0].reviewStatus, "unreviewed", "review status was disturbed by an unrelated edit");
  assert.equal(remapped[0].reviewedBy, null);
  assert.equal(remapped[0].reviewerNote, "");
});

test("C2: an edit BEFORE a marked passage shifts its offsets correctly", () => {
  const items = [item({ id: "dog", start: 31, machineText: "dog" })];
  assert.equal(DRAFT.slice(31, 34), "dog");
  // Insert two words near the start; the marked passage moves right.
  const submitted = "on Tuesday the cat sat on the mat and the dog barked loudly";

  const remapped = remapReviewItemsAfterWholeDocumentEdit(DRAFT, submitted, items);
  assert.equal(submitted.slice(remapped[0].start, remapped[0].end), "dog");
  assert.notEqual(remapped[0].start, 31, "offsets were not updated for text inserted before the passage");
});

test("C2: changing a marked passage through the whole-document editor is rejected", () => {
  const items = [item()]; // "cat"
  const submitted = "the CAT sat on the mat and the dog barked loudly";

  assert.throws(
    () => remapReviewItemsAfterWholeDocumentEdit(DRAFT, submitted, items),
    /contextual review control/i,
    "a flagged passage was silently rewritten through the whole-document editor",
  );
});

test("C2: deleting a marked passage is rejected", () => {
  const items = [item()];
  const submitted = "the sat on the mat and the dog barked loudly";
  assert.throws(() => remapReviewItemsAfterWholeDocumentEdit(DRAFT, submitted, items), /contextual review control/i);
});

test("C2: duplicating a marked passage is rejected, because it stops being identifiable", () => {
  const items = [item()];
  const submitted = "the cat sat on the mat and the cat barked loudly";
  assert.throws(() => remapReviewItemsAfterWholeDocumentEdit(DRAFT, submitted, items), /contextual review control/i);
});

test("C2: reordering two marked passages is rejected", () => {
  const items = [
    item({ id: "cat", start: 4, machineText: "cat" }),
    item({ id: "dog", start: 31, machineText: "dog" }),
  ];
  // Same words, opposite logical order.
  const submitted = "the dog sat on the mat and the cat barked loudly";
  assert.throws(() => remapReviewItemsAfterWholeDocumentEdit(DRAFT, submitted, items), /contextual review control/i);
});

test("C2: a corrected passage re-anchors on its CURRENT text, not the machine text", () => {
  // After a contextual correction, reviewedText is what is in the document. A later
  // unflagged edit must still map, and must not resurrect the machine text.
  const current = "the lynx sat on the mat and the dog barked loudly";
  const items = [item({ id: "cat", start: 4, machineText: "cat", reviewedText: "lynx", end: 8, reviewStatus: "corrected" })];
  const submitted = "the lynx sat on the mat and the dog barks loudly";

  const remapped = remapReviewItemsAfterWholeDocumentEdit(current, submitted, items);
  assert.equal(submitted.slice(remapped[0].start, remapped[0].end), "lynx");
  assert.equal(remapped[0].machineText, "cat", "the original machine output was lost");
  assert.equal(remapped[0].reviewStatus, "corrected", "a corrected passage was relabelled by a document edit");
});

test("C2: a stale editor is refused rather than re-anchored against the wrong text", () => {
  // The item claims a range that no longer holds its text — the client is out of date.
  const items = [item({ start: 99, end: 102 })];
  assert.throws(
    () => remapReviewItemsAfterWholeDocumentEdit(DRAFT, DRAFT, items),
    /Reload before editing/i,
  );
});

test("C2: wholesale replacement remains possible when nothing is flagged", () => {
  // The Stage 1 "replace a poor OCR starting point with a specialist transcription"
  // workflow is unaffected: with no marked passages there is nothing to preserve.
  const remapped = remapReviewItemsAfterWholeDocumentEdit(DRAFT, "An entirely retyped transcription.", []);
  assert.deepEqual(remapped, []);
});
