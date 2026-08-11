/**
 * Stage 2 — Correction 1. Provider document confidence is not engine agreement.
 *
 * The hybrid pipeline reports `confidenceBasis: "consensus"` with a numeric value derived
 * from how far ABC's OCR and Liblouis agree. That number is real and useful, but it is a
 * measure of two engines saying the same thing — not a provider's stated confidence in
 * the document. Storing it in `EvalSample.confidence` and averaging it into a figure
 * labelled "confidence" would present an agreement score as an accuracy score.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  averageProviderDocumentConfidence,
  providerDocumentConfidence,
} from "../src/lib/quality-confidence.ts";

const providerScore = {
  availability: "available",
  value: 0.82,
  kind: "provider_score",
} as const;

const engineAgreement = {
  availability: "available",
  value: 0.9,
  kind: "engine_agreement",
} as const;

const unavailable = {
  availability: "unavailable",
  value: null,
  kind: "unavailable",
} as const;

test("C1: a provider document score is stored", () => {
  assert.equal(providerDocumentConfidence(providerScore), 0.82);
});

test("C1: 0.90 engine agreement does NOT populate EvalSample.confidence", () => {
  // The headline case from independent review: the hybrid path reports consensus, and
  // that value must not become the sample's document confidence.
  assert.equal(providerDocumentConfidence(engineAgreement), null);
});

test("C1: absent evidence stores null rather than a default", () => {
  assert.equal(providerDocumentConfidence(unavailable), null);
  assert.equal(providerDocumentConfidence(null), null);
  assert.equal(providerDocumentConfidence(undefined), null);
});

test("C1: an available provider_score with no numeric value is still null", () => {
  assert.equal(
    providerDocumentConfidence({ availability: "available", value: null, kind: "provider_score" }),
    null,
  );
});

test("C1: engine agreement does not contribute to the average provider confidence", () => {
  const samples = [
    { confidence: 0.8, confidenceEvidenceKind: "provider_score" as const },
    // A hybrid sample: 0.90 agreement, and it must be invisible to this aggregate.
    { confidence: 0.9, confidenceEvidenceKind: "engine_agreement" as const },
    { confidence: null, confidenceEvidenceKind: "unavailable" as const },
  ];

  const average = averageProviderDocumentConfidence(samples);
  assert.equal(average, 0.8, "engine agreement leaked into the provider confidence average");
});

test("C1: an all-hybrid evaluation reports no provider confidence at all", () => {
  const samples = [
    { confidence: 0.9, confidenceEvidenceKind: "engine_agreement" as const },
    { confidence: 0.95, confidenceEvidenceKind: "engine_agreement" as const },
  ];
  assert.equal(
    averageProviderDocumentConfidence(samples),
    null,
    "an average was invented from engine agreement alone",
  );
});

test("C1: historical samples with an untyped number are excluded", () => {
  // Records written before Stage 2 carry a number whose semantics cannot be proven, so
  // they are not silently counted as provider scores.
  const samples = [
    { confidence: 0.5 },
    { confidence: 0.7, confidenceEvidenceKind: "provider_score" as const },
  ];
  assert.equal(averageProviderDocumentConfidence(samples), 0.7);
});

test("C1: the average is a genuine mean of provider scores only", () => {
  const samples = [
    { confidence: 0.6, confidenceEvidenceKind: "provider_score" as const },
    { confidence: 0.8, confidenceEvidenceKind: "provider_score" as const },
    { confidence: 0.9, confidenceEvidenceKind: "engine_agreement" as const },
  ];
  assert.equal(averageProviderDocumentConfidence(samples), 0.7);
});

test("C1: an empty evaluation has no average", () => {
  assert.equal(averageProviderDocumentConfidence([]), null);
});
