import type {
  StandardRuleEvaluation,
  StandardsEvaluationOutcome,
  StandardsOverrideDecision,
  TaskStatus,
  TranscriptionProvenance,
  TranscriptionStatus,
} from "../types";
import {
  rawBrailleEvidence,
  registeredStandardsRules,
  requireRegisteredRule,
} from "./registry.ts";

const NUMERIC_PREFIX = "⠼";
const NUMERIC_ROOTS = new Set(["⠁", "⠃", "⠉", "⠙", "⠑", "⠋", "⠛", "⠓", "⠊", "⠚", "⠂", "⠲"]);
const BOUNDED_OUTCOMES = new Set<StandardsEvaluationOutcome>([
  "not_applicable",
  "consistent",
  "possible_conflict",
  "insufficient_evidence",
]);

function numericIndicatorOutcome(rawPages: string[]): {
  outcome: StandardsEvaluationOutcome;
  summary: string;
} {
  if (rawPages.length === 0) {
    return {
      outcome: "insufficient_evidence",
      summary: "Raw Braille is unavailable, so the encoded numeric-indicator rule cannot be evaluated.",
    };
  }
  const found = rawPages.some((raw) => {
    const chars = [...raw];
    return chars.some((char, index) => char === NUMERIC_PREFIX && NUMERIC_ROOTS.has(chars[index + 1] ?? ""));
  });
  return found
    ? {
        outcome: "consistent",
        summary: "A numeric prefix followed by one of the twelve section 6.1 roots was found in the raw Braille.",
      }
    : {
        outcome: "not_applicable",
        summary: "No numeric-indicator sequence covered by this bounded rule was found.",
      };
}

export function evaluateRegisteredRule(
  ruleId: string,
  provenance: TranscriptionProvenance | null | undefined,
  evaluatedAt: string,
): StandardRuleEvaluation {
  const rule = requireRegisteredRule(ruleId);
  const evidence = rawBrailleEvidence(provenance);
  const result = numericIndicatorOutcome(evidence);
  if (!BOUNDED_OUTCOMES.has(result.outcome)) throw new Error("Invalid standards outcome");
  return {
    standardFamily: rule.standardFamily,
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    ruleTitle: rule.title,
    sourceReference: rule.sourceReference,
    automatedOutcome: result.outcome,
    evaluatedAt,
    evidenceSummary: result.summary,
    evidenceCellIds: [],
    implementationScope: rule.implementationScope,
    limitations: [...rule.limitations],
    overrides: [],
  };
}

export function evaluateRegisteredStandards(
  provenance: TranscriptionProvenance | null | undefined,
  evaluatedAt: string,
): StandardRuleEvaluation[] {
  return registeredStandardsRules().map((rule) =>
    evaluateRegisteredRule(rule.ruleId, provenance, evaluatedAt),
  );
}

const DECISIONS = new Set<StandardsOverrideDecision>([
  "confirm_interpretation",
  "mark_not_applicable",
  "override_warning",
]);

export function planStandardsOverride(request: {
  taskStatus: TaskStatus;
  transcriptionStatus: TranscriptionStatus;
  evaluations: StandardRuleEvaluation[];
  ruleId: string;
  decision: StandardsOverrideDecision;
  reviewerId: string;
  reviewedAt: string;
  reason: string;
}): { ok: true; evaluations: StandardRuleEvaluation[] } | { ok: false; error: string } {
  if (request.taskStatus === "rejected" || request.taskStatus === "archived") {
    return { ok: false, error: "This task is closed and cannot be changed" };
  }
  if (request.transcriptionStatus === "specialist_verified") {
    return { ok: false, error: "This transcription is verified and locked" };
  }
  if (!DECISIONS.has(request.decision)) return { ok: false, error: "Invalid override decision" };
  const reason = request.reason.trim();
  if (!reason) return { ok: false, error: "A specialist reason is required" };
  const index = request.evaluations.findIndex((evaluation) => evaluation.ruleId === request.ruleId);
  if (index < 0) return { ok: false, error: "The standards rule is not present on this transcription" };
  try {
    requireRegisteredRule(request.ruleId);
  } catch {
    return { ok: false, error: "The standards rule is not registered" };
  }
  const current = request.evaluations[index];
  if (request.decision === "override_warning" && current.automatedOutcome !== "possible_conflict") {
    return { ok: false, error: "Only a possible conflict can be overridden as a warning" };
  }
  const evaluations = request.evaluations.map((evaluation, evaluationIndex) =>
    evaluationIndex === index
      ? {
          ...evaluation,
          overrides: [
            ...evaluation.overrides,
            {
              decision: request.decision,
              reviewerId: request.reviewerId,
              reviewedAt: request.reviewedAt,
              reason,
            },
          ],
        }
      : evaluation,
  );
  return { ok: true, evaluations };
}
