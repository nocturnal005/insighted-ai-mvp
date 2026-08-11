/**
 * Passage-review decision rules, kept pure so they can be proved behaviourally.
 *
 * These rules used to live inline in the `reviewTranscriptionItem` server action, which
 * meant the only way to check them was to read the source. Independent review asked for
 * behavioural evidence that a corrected passage cannot be relabelled "confirmed" and that
 * a closed task refuses passage mutations — so the decision is made here, by a function
 * that needs no database, no session and no Next.js runtime, and the action applies the
 * plan it returns. There is one implementation of each rule, not two.
 */
import type {
  TaskStatus,
  TranscriptionReviewItem,
  TranscriptionReviewStatus,
  TranscriptionStatus,
} from "@/lib/types";

/** Lifecycle states in which the task is finished with, whatever the reviewer's role. */
const CLOSED_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>(["rejected", "archived"]);

export const CLOSED_TASK_ERROR =
  "Task is closed. A rejected or archived task cannot be reviewed until it is reopened.";

export type ReviewMutationStatus = Exclude<TranscriptionReviewStatus, "unreviewed">;

export interface ReviewMutationRequest {
  readonly taskStatus: TaskStatus;
  readonly transcriptionStatus: TranscriptionStatus;
  readonly editedText: string;
  readonly items: readonly TranscriptionReviewItem[];
  readonly itemId: string;
  readonly nextStatus: ReviewMutationStatus;
  /** Whatever is currently in the reviewer's textarea, saved or not. */
  readonly submittedText: string;
  readonly reviewerNote: string;
  readonly reviewedBy: string;
  readonly reviewedAt: string;
}

export type ReviewMutationPlan =
  | { readonly ok: false; readonly error: string }
  | {
      readonly ok: true;
      readonly editedText: string;
      readonly items: TranscriptionReviewItem[];
      readonly previousStatus: TranscriptionReviewStatus;
    };

/**
 * Decide whether a passage review may proceed, and what it changes if so.
 *
 * THE ORDER OF THESE CHECKS IS THE POINT. Lifecycle first (a closed task refuses every
 * reviewer), then verification lock, then the passage's own integrity, and only then the
 * semantics of the requested transition. A caller cannot reach a later rule by failing an
 * earlier one.
 */
export function planReviewItemMutation(request: ReviewMutationRequest): ReviewMutationPlan {
  if (!(["confirmed", "corrected", "needs_rescan"] as const).includes(request.nextStatus)) {
    return { ok: false, error: "Invalid review state" };
  }
  // Lifecycle is a server-side boundary, not a hidden button. An authorised specialist
  // acting on a rejected or archived task is refused exactly like anyone else.
  if (CLOSED_TASK_STATUSES.has(request.taskStatus)) {
    return { ok: false, error: CLOSED_TASK_ERROR };
  }
  if (request.transcriptionStatus === "specialist_verified") {
    return { ok: false, error: "Already verified and locked" };
  }

  const item = request.items.find((candidate) => candidate.id === request.itemId);
  if (!item) return { ok: false, error: "Review item not found" };

  if (request.editedText.slice(item.start, item.end) !== item.reviewedText) {
    return {
      ok: false,
      error: "This passage changed after it was selected. Reload and review the latest text.",
    };
  }

  if (request.nextStatus === "confirmed") {
    /**
     * CONFIRMED MEANS "THE MACHINE READ THIS CORRECTLY", AND NOTHING ELSE.
     *
     * Two distinct ways that claim could become false, refused separately so the reviewer
     * is told which one applies. First: text sitting unsaved in the textarea must not be
     * silently discarded by pressing Confirm. Second: a passage whose stored text already
     * differs from the machine output is a CORRECTION, and calling it confirmed would
     * assert the machine got right something a human had to fix.
     */
    if (request.submittedText !== item.reviewedText) {
      return {
        ok: false,
        error:
          "The passage has unsaved text. Save the correction or restore the current text before confirming.",
      };
    }
    if (item.reviewedText !== item.machineText) {
      return {
        ok: false,
        error:
          "A corrected passage cannot be confirmed unless it is first restored to the original machine text.",
      };
    }
  }

  const replacement = request.nextStatus === "corrected" ? request.submittedText : item.reviewedText;
  if (request.nextStatus === "corrected" && !replacement.trim()) {
    return { ok: false, error: "Corrected translation text is required" };
  }

  const previousStatus = item.reviewStatus;
  let editedText = request.editedText;
  const delta = replacement.length - item.reviewedText.length;
  const oldEnd = item.end;

  if (request.nextStatus === "corrected") {
    editedText =
      request.editedText.slice(0, item.start) + replacement + request.editedText.slice(item.end);
  }

  const items = request.items.map((candidate) => {
    if (candidate.id === item.id) {
      return {
        ...candidate,
        reviewedText: replacement,
        end: request.nextStatus === "corrected" ? item.start + replacement.length : candidate.end,
        reviewStatus: request.nextStatus,
        reviewerNote: request.reviewerNote.trim(),
        reviewedBy: request.reviewedBy,
        reviewedAt: request.reviewedAt,
      };
    }
    // A correction changes the document's length, so every later passage moves with it.
    if (request.nextStatus === "corrected" && candidate.start >= oldEnd) {
      return { ...candidate, start: candidate.start + delta, end: candidate.end + delta };
    }
    return candidate;
  });

  return { ok: true, editedText, items, previousStatus };
}

/** The same lifecycle boundary, for the whole-document editor. */
export function closedTaskError(status: TaskStatus): string | null {
  return CLOSED_TASK_STATUSES.has(status) ? CLOSED_TASK_ERROR : null;
}
