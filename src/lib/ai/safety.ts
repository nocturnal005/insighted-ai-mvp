/**
 * Safety helpers shared across providers.
 *
 * Two jobs: (1) never let a raw provider error (which may embed a key, URL, or payload)
 * reach the user/logs/audit — always reduce it to a short, safe label; (2) decide when an
 * assessment-context task is missing the prompt/skill needed to reason about answer leaks.
 */
import type { UncertaintyFlag, VisualContext } from "./types";
import { assessmentContextMissingFlag, makeFlag } from "./uncertainty";

/** Hard cap so a malformed provider flag can never flood the UI/audit. */
const MAX_FLAG_TEXT = 300;

/** Trim overlong provider-supplied text so it cannot flood the UI or audit. */
export function truncateText(value: string, max: number = MAX_FLAG_TEXT): string {
  const s = value.trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Cap on any single free-text field sent to a real provider. */
const MAX_PROVIDER_TEXT = 200;

/**
 * Lightweight safety layer for free-text context bound for a REAL provider. Trims, length-
 * limits, and redacts obvious emails / UK phone numbers / UK postcodes. It is deliberately
 * NOT full PII detection — pupil names/identifiers are already never sent (only a boolean
 * `hasLinkedPupil`); this reduces incidental leakage in titles/prompts/etc.
 */
export function sanitizeProviderText(
  value: string | null | undefined,
  max: number = MAX_PROVIDER_TEXT,
): string | null {
  if (value == null) return null;
  let s = String(value).trim();
  if (!s) return null;
  s = s
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email removed]")
    .replace(/(?:\+?44\s?7\d{3}|\(?07\d{3}\)?)\s?\d{3}\s?\d{3}/g, "[phone removed]")
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, "[postcode removed]");
  s = s.trim();
  if (s.length > max) s = `${s.slice(0, max - 1)}…`;
  return s || null;
}

/**
 * Real-pupil-data safety guard. When the app is in real mode and a task is linked to a
 * pupil while `ALLOW_REAL_PUPIL_DATA` is false, returns a high-severity warning flag. It
 * does NOT block the workflow (so demos keep working) but makes the risk explicit and
 * auditable. Identifiable pupil context is never sent to a real provider regardless.
 */
export function assertRealAiDataAllowed(params: {
  aiMode: "mock" | "real";
  allowRealPupilData: boolean;
  hasLinkedPupil?: boolean;
  objectLabel?: string;
}): UncertaintyFlag[] {
  if (params.aiMode !== "real" || !params.hasLinkedPupil || params.allowRealPupilData) {
    return [];
  }
  return [
    makeFlag({
      text: "Pupil-linked task sent to a real provider",
      reason:
        "This task is linked to a pupil and AI_MODE is real while ALLOW_REAL_PUPIL_DATA is false. " +
        "Only non-identifying context (title, subject, year group, prompt, assessed skill, image) is sent — " +
        "never pupil names or identifiers. Identifiable pupil data must not be sent to real providers " +
        "without school data-protection approval.",
      category: "requires_specialist_review",
      severity: "high",
      suggestedAction:
        "Use mock mode for pupil-linked work, or obtain data-protection approval and set ALLOW_REAL_PUPIL_DATA=true.",
    }),
  ];
}

const ASSESSMENT_CONTEXTS: VisualContext[] = [
  "class_test",
  "mock_assessment",
  "formal_assessment_preparation",
  "assessment",
];

export function isAssessmentContext(context: VisualContext): boolean {
  return ASSESSMENT_CONTEXTS.includes(context);
}

/**
 * Returns a high-severity flag when an assessment-like task lacks the question prompt or
 * assessed skill — the two things needed to judge whether a description leaks the answer.
 */
export function assessmentContextFlags(params: {
  context: VisualContext;
  questionPrompt?: string | null;
  assessedSkill?: string | null;
}): UncertaintyFlag[] {
  if (!isAssessmentContext(params.context)) return [];
  const hasPrompt = Boolean(params.questionPrompt && params.questionPrompt.trim());
  const hasSkill = Boolean(params.assessedSkill && params.assessedSkill.trim());
  if (hasPrompt && hasSkill) return [];
  return [assessmentContextMissingFlag()];
}

/**
 * Reduce any thrown value to a short, non-sensitive label. Deliberately drops the
 * message body so API keys, endpoints, and request payloads never surface downstream.
 */
export function safeErrorLabel(err: unknown): string {
  if (err && typeof err === "object") {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return `provider responded with status ${status}`;
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && /^[a-z0-9_\-]+$/i.test(code)) return `provider error (${code})`;
    const name = (err as { name?: unknown }).name;
    if (typeof name === "string" && name && name !== "Error") return `provider error (${name})`;
  }
  return "provider error";
}
