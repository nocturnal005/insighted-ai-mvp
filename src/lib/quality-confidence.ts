interface ConfidenceEvidenceLike {
  availability: "available" | "unavailable";
  value: number | null;
  kind: "provider_score" | "engine_agreement" | "unavailable";
}

interface EvaluationConfidenceLike {
  confidence?: number | null;
  confidenceEvidenceKind?: ConfidenceEvidenceLike["kind"] | null;
}

/** Only a genuine provider-supplied document score belongs in EvalSample.confidence. */
export function providerDocumentConfidence(
  evidence: ConfidenceEvidenceLike | null | undefined,
): number | null {
  return evidence?.availability === "available" &&
    evidence.kind === "provider_score" &&
    typeof evidence.value === "number"
    ? evidence.value
    : null;
}

/** Historical/untyped numbers are excluded because their semantics cannot be proven. */
export function averageProviderDocumentConfidence(
  samples: readonly EvaluationConfidenceLike[],
): number | null {
  const scores = samples
    .filter((sample) => sample.confidenceEvidenceKind === "provider_score")
    .map((sample) => sample.confidence)
    .filter((score): score is number => typeof score === "number");
  return scores.length ? scores.reduce((total, score) => total + score, 0) / scores.length : null;
}
