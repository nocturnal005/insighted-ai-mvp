import type {
  StandardsApplicability,
  StandardRuleEvaluation,
  StandardsEvaluationOutcome,
  StandardsOverrideDecision,
  TaskStatus,
  TranscriptionProvenance,
  TranscriptionStatus,
} from "../types";
import type { BrailleOcrResult } from "../ai/types";
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

const UEB_ABC_PROMPT_VERSION = "abc-braille-en-ueb-g2.ctb";

/**
 * Resolve Braivanta's evaluation context independently of transcription provenance.
 * A configured workflow can establish why Braivanta evaluates UEB, but it never proves
 * that the OCR provider applied UEB or any particular translation table.
 */
export function standardsApplicabilityForRun(
  result: BrailleOcrResult,
): StandardsApplicability {
  const directAbcUeb =
    result.meta.provider === "abc_braille_web" &&
    result.meta.promptVersion === UEB_ABC_PROMPT_VERSION;
  const hybridUeb = result.meta.provider === "abc_openai_review";

  if (directAbcUeb || hybridUeb) {
    return {
      standardFamily: "UEB",
      basis: "configured_workflow",
      evidenceStatus: "supported",
      context: directAbcUeb
        ? "Braivanta configured this OCR workflow to request en-ueb-g2.ctb."
        : "Braivanta configured this hybrid review workflow with the en-ueb-g2 language context.",
      source: directAbcUeb
        ? "Braivanta ABC workflow request configuration"
        : "Braivanta hybrid review workflow configuration",
      providerProof: "not_established",
      limitations: [
        "This is Braivanta evaluation context, not proof that the OCR provider applied UEB or a translation table.",
      ],
    };
  }

  return {
    standardFamily: "UEB",
    basis: "unavailable",
    evidenceStatus: "unavailable",
    context: "No explicit UEB evaluation context is established for this transcription workflow.",
    source: null,
    providerProof: "not_established",
    limitations: [
      "Raw Braille alone does not establish UEB applicability or prove provider table use.",
    ],
  };
}

function hasApplicableUebContext(applicability: StandardsApplicability): boolean {
  return (
    applicability.standardFamily === "UEB" &&
    applicability.basis === "configured_workflow" &&
    applicability.evidenceStatus === "supported"
  );
}

function numericIndicatorOutcome(
  rawPages: string[],
  applicability: StandardsApplicability,
): {
  outcome: StandardsEvaluationOutcome;
  summary: string;
} {
  if (!hasApplicableUebContext(applicability)) {
    return {
      outcome: "insufficient_evidence",
      summary:
        "UEB applicability is not established for this transcription. Raw Braille alone is not proof that the provider used UEB.",
    };
  }
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
  applicability: StandardsApplicability,
  evaluatedAt: string,
): StandardRuleEvaluation {
  const rule = requireRegisteredRule(ruleId);
  const evidence = rawBrailleEvidence(provenance);
  const result = numericIndicatorOutcome(evidence, applicability);
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
    applicability: { ...applicability, limitations: [...applicability.limitations] },
    implementationScope: rule.implementationScope,
    limitations: [...rule.limitations],
    overrides: [],
  };
}

export function evaluateRegisteredStandards(
  provenance: TranscriptionProvenance | null | undefined,
  applicability: StandardsApplicability,
  evaluatedAt: string,
): StandardRuleEvaluation[] {
  return registeredStandardsRules().map((rule) =>
    evaluateRegisteredRule(rule.ruleId, provenance, applicability, evaluatedAt),
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
  if (
    request.decision !== "mark_not_applicable" &&
    (!current.applicability || !hasApplicableUebContext(current.applicability))
  ) {
    return { ok: false, error: "UEB applicability is not established for this evaluation" };
  }
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
