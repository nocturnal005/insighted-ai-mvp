import type { VisualDescriptionTask } from "@/lib/types";

export type AssessmentContext = VisualDescriptionTask["context"];

export const ASSESSMENT_CONTEXT_OPTIONS: ReadonlyArray<{
  value: AssessmentContext;
  label: string;
}> = [
  { value: "lesson", label: "Lesson / teaching" },
  { value: "class_test", label: "Class test" },
  { value: "mock_assessment", label: "Mock assessment" },
  { value: "formal_assessment_preparation", label: "Formal assessment preparation" },
  { value: "assessment", label: "Assessment" },
];

const ASSESSMENT_LIKE_CONTEXTS = new Set<AssessmentContext>([
  "class_test",
  "mock_assessment",
  "formal_assessment_preparation",
  "assessment",
]);

export function isAssessmentLikeContext(context: AssessmentContext): boolean {
  return ASSESSMENT_LIKE_CONTEXTS.has(context);
}

export function assessmentContextLabel(context: AssessmentContext): string {
  return ASSESSMENT_CONTEXT_OPTIONS.find((option) => option.value === context)?.label ?? context;
}

export function parseAssessmentContext(value: unknown, fallback: AssessmentContext): AssessmentContext {
  return ASSESSMENT_CONTEXT_OPTIONS.some((option) => option.value === value)
    ? (value as AssessmentContext)
    : fallback;
}

export function hasCompleteAssessmentContext(
  context: AssessmentContext,
  questionPrompt?: string | null,
  assessedSkill?: string | null,
): boolean {
  if (!isAssessmentLikeContext(context)) return true;
  return Boolean(questionPrompt?.trim() && assessedSkill?.trim());
}
