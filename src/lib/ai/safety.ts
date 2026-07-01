/**
 * Safety helpers shared across providers.
 *
 * Two jobs: (1) never let a raw provider error (which may embed a key, URL, or payload)
 * reach the user/logs/audit — always reduce it to a short, safe label; (2) decide when an
 * assessment-context task is missing the prompt/skill needed to reason about answer leaks.
 */
import type { UncertaintyFlag, VisualContext } from "./types";
import { assessmentContextMissingFlag } from "./uncertainty";

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
