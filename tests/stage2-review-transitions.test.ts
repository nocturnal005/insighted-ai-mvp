/**
 * Stage 2 — Corrections 3 and 5. What "confirmed" is allowed to mean, and who the
 * lifecycle boundary applies to.
 *
 * `planReviewItemMutation` is the single decision point the `reviewTranscriptionItem`
 * server action delegates to, so these exercise the rule itself rather than a copy of it.
 * Every case here assumes the caller ALREADY passed the specialist permission check — the
 * point is that authorisation is not sufficient.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CLOSED_TASK_ERROR,
  closedTaskError,
  planReviewItemMutation,
  type ReviewMutationRequest,
} from "../src/lib/verification/review-guards.ts";
import type { TranscriptionReviewItem } from "../src/lib/types.ts";

const DRAFT = "the cat sat on the mat";

function item(overrides: Partial<TranscriptionReviewItem> = {}): TranscriptionReviewItem {
  return {
    id: "review-1",
    start: 4,
    end: 7,
    machineText: "cat",
    reviewedText: "cat",
    uncertaintyState: "review_required",
    reviewStatus: "unreviewed",
    category: "engine_disagreement",
    severity: "high",
    reason: "Engine disagreement.",
    evidenceSource: "secondary_ai_review",
    confidence: null,
    confidenceSource: null,
    alternativeText: "lynx",
    reviewerNote: "",
    reviewedBy: null,
    reviewedAt: null,
    ...overrides,
  };
}

function request(overrides: Partial<ReviewMutationRequest> = {}): ReviewMutationRequest {
  const items = overrides.items ?? [item()];
  return {
    taskStatus: "needs_specialist_review",
    transcriptionStatus: "needs_specialist_review",
    editedText: DRAFT,
    items,
    itemId: "review-1",
    nextStatus: "confirmed",
    submittedText: "cat",
    reviewerNote: "",
    reviewedBy: "user-specialist",
    reviewedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ===========================================================================
// Correction 3 — confirmed and corrected are different claims
// ===========================================================================
test("C3: machine text can be confirmed", () => {
  const plan = planReviewItemMutation(request());
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.items[0].reviewStatus, "confirmed");
  assert.equal(plan.items[0].reviewedText, "cat", "confirming altered the passage text");
  assert.equal(plan.editedText, DRAFT, "confirming altered the document");
  assert.equal(plan.items[0].reviewedBy, "user-specialist");
});

test("C3: machine text can be corrected, and the document follows", () => {
  const plan = planReviewItemMutation(
    request({ nextStatus: "corrected", submittedText: "lynx" }),
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.items[0].reviewStatus, "corrected");
  assert.equal(plan.items[0].reviewedText, "lynx");
  assert.equal(plan.items[0].machineText, "cat", "the original machine output was overwritten");
  assert.equal(plan.editedText, "the lynx sat on the mat");
  assert.equal(plan.items[0].end, 8, "the passage range was not widened to fit the correction");
});

test("C3: a corrected passage cannot then be relabelled confirmed", () => {
  // The reviewer corrected "cat" → "lynx" earlier; the document and the item agree.
  const corrected = item({ reviewedText: "lynx", end: 8, reviewStatus: "corrected" });
  const plan = planReviewItemMutation(
    request({
      items: [corrected],
      editedText: "the lynx sat on the mat",
      nextStatus: "confirmed",
      submittedText: "lynx",
    }),
  );

  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.match(plan.error, /restored to the original machine text/i);
});

test("C3: restoring the machine text first makes confirmation available again", () => {
  // The mandate's escape hatch: restore, then confirm. Both steps are explicit.
  const restored = planReviewItemMutation(
    request({
      items: [item({ reviewedText: "lynx", end: 8, reviewStatus: "corrected" })],
      editedText: "the lynx sat on the mat",
      nextStatus: "corrected",
      submittedText: "cat",
    }),
  );
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.editedText, DRAFT);

  const confirmed = planReviewItemMutation(
    request({ items: restored.items, editedText: restored.editedText, nextStatus: "confirmed", submittedText: "cat" }),
  );
  assert.equal(confirmed.ok, true);
  if (!confirmed.ok) return;
  assert.equal(confirmed.items[0].reviewStatus, "confirmed");
});

test("C3: Confirm never silently discards unsaved textarea text", () => {
  // The reviewer typed a correction but pressed Confirm. Their edit must not vanish, and
  // the machine must not be credited with a reading the reviewer was in the act of fixing.
  const plan = planReviewItemMutation(request({ nextStatus: "confirmed", submittedText: "lynx" }));
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.match(plan.error, /unsaved text/i);
});

test("C3: an empty correction is refused", () => {
  const plan = planReviewItemMutation(request({ nextStatus: "corrected", submittedText: "   " }));
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.match(plan.error, /required/i);
});

test("C3: needs_rescan neither changes the text nor requires machine equality", () => {
  const plan = planReviewItemMutation(
    request({
      items: [item({ reviewedText: "lynx", end: 8, reviewStatus: "corrected" })],
      editedText: "the lynx sat on the mat",
      nextStatus: "needs_rescan",
      submittedText: "anything",
    }),
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.items[0].reviewStatus, "needs_rescan");
  assert.equal(plan.editedText, "the lynx sat on the mat", "a re-scan request rewrote the document");
  assert.equal(plan.items[0].reviewedText, "lynx");
});

test("C3: a correction shifts every later passage by the length delta", () => {
  const items = [
    item({ id: "cat", start: 4, end: 7, machineText: "cat", reviewedText: "cat" }),
    item({ id: "mat", start: 19, end: 22, machineText: "mat", reviewedText: "mat" }),
  ];
  assert.equal(DRAFT.slice(19, 22), "mat");

  const plan = planReviewItemMutation(
    request({ items, itemId: "cat", nextStatus: "corrected", submittedText: "lynx" }),
  );
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  const later = plan.items.find((entry) => entry.id === "mat")!;
  assert.equal(
    plan.editedText.slice(later.start, later.end),
    "mat",
    "a later passage lost its anchor when an earlier one was corrected",
  );
});

test("C3: a passage that moved under the reviewer is refused", () => {
  const plan = planReviewItemMutation(request({ editedText: "completely different text" }));
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.match(plan.error, /Reload and review the latest text/i);
});

// ===========================================================================
// Correction 5 — the lifecycle boundary is server-side, not a hidden button
// ===========================================================================
for (const taskStatus of ["rejected", "archived"] as const) {
  for (const nextStatus of ["confirmed", "corrected", "needs_rescan"] as const) {
    test(`C5: an authorised specialist cannot ${nextStatus} a passage on a ${taskStatus} task`, () => {
      const plan = planReviewItemMutation(
        request({ taskStatus, nextStatus, submittedText: nextStatus === "corrected" ? "lynx" : "cat" }),
      );
      assert.equal(plan.ok, false, `a ${taskStatus} task accepted a ${nextStatus} mutation`);
      if (plan.ok) return;
      assert.equal(plan.error, CLOSED_TASK_ERROR);
    });
  }
}

test("C5: the closed-task check runs before the passage is even looked up", () => {
  // Ordering matters: a closed task must not leak whether an item id exists.
  const plan = planReviewItemMutation(request({ taskStatus: "archived", itemId: "does-not-exist" }));
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.equal(plan.error, CLOSED_TASK_ERROR);
});

test("C5: open task statuses are unaffected", () => {
  for (const taskStatus of ["ready_for_transcription", "needs_specialist_review", "teacher_review"] as const) {
    assert.equal(closedTaskError(taskStatus), null, `${taskStatus} was treated as closed`);
  }
  assert.equal(closedTaskError("rejected"), CLOSED_TASK_ERROR);
  assert.equal(closedTaskError("archived"), CLOSED_TASK_ERROR);
});

test("C5: a verified transcription is still locked", () => {
  const plan = planReviewItemMutation(request({ transcriptionStatus: "specialist_verified" }));
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.match(plan.error, /verified and locked/i);
});

test("C5: an unknown review status is refused outright", () => {
  const plan = planReviewItemMutation(
    request({ nextStatus: "unreviewed" as unknown as ReviewMutationRequest["nextStatus"] }),
  );
  assert.equal(plan.ok, false);
  if (plan.ok) return;
  assert.match(plan.error, /Invalid review state/i);
});
