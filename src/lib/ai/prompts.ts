/**
 * Prompt definitions and version strings.
 *
 * Prompt text lives here (not inside providers) so every AI run can record exactly which
 * prompt version produced it. Prompts instruct the model to return strict JSON matching
 * the zod schemas in the OpenAI provider — no prose, no markdown.
 */
import type {
  StemDescriptionInput,
  VisualContext,
  VisualDescriptionInput,
} from "./types";
import { isAssessmentContext } from "./safety";

export const PROMPT_VERSIONS = {
  visual: "visual-description-v1",
  stem: "stem-description-v1",
  brailleDraft: "braille-openai-draft-v1",
  mockBraille: "mock-braille-v1",
  mockVisual: "mock-visual-v1",
  mockStem: "mock-stem-v1",
} as const;

const NEUTRALITY_RULES = [
  "Describe only what is visibly present. Do not interpret, conclude, or infer trends.",
  "Do not state answers, results, gradients, correlations, or 'what this shows'.",
  "Use plain, spatial language suitable for a visually impaired learner.",
  "Report every axis title, label, unit and category verbatim where legible.",
].join(" ");

export function buildVisualPrompt(input: VisualDescriptionInput): string {
  const assessment = isAssessmentContext(input.context);
  const lines = [
    "You are an accessibility assistant producing a NEUTRAL, assessment-safe description",
    "of an educational visual for a visually impaired learner. You are NOT answering the",
    "question and must not reveal what the learner is being assessed on.",
    "",
    `Context: ${input.context}. Hint tier: ${input.hintTier ?? "tier_0"}.`,
    input.subject ? `Subject: ${input.subject}.` : "",
    input.yearGroup ? `Year group: ${input.yearGroup}.` : "",
    input.questionPrompt ? `Question prompt: ${input.questionPrompt}` : "Question prompt: (not supplied)",
    input.assessedSkill ? `Assessed skill: ${input.assessedSkill}` : "Assessed skill: (not supplied)",
    "",
    "Rules: " + NEUTRALITY_RULES,
    assessment
      ? "This is assessment use: be maximally conservative and flag anything that could hint at the answer."
      : "This is lesson/teaching use: still neutral, but orientation detail is acceptable.",
    "",
    "Return STRICT JSON only, matching exactly this shape:",
    "{",
    '  "visualType": "line_graph|bar_chart|table|labelled_diagram|science_diagram|experiment_setup|map|photo|other",',
    '  "neutralDescription": string,',
    '  "visibleElements": string[],',
    '  "labelsDetected": string[],',
    '  "spatialLayout": string,',
    '  "confidence": number (0..1),',
    '  "answerSensitiveFlags": [ { "text": string, "reason": string, "category": string, "severity": "low|medium|high" } ]',
    "}",
    "For answerSensitiveFlags.category use one of: trend_revealed, comparison_revealed,",
    "answer_value_revealed, label_reveals_answer, visual_emphasis_reveals_answer,",
    "relationship_interpreted, cause_effect_implied, unnecessary_clue, answer_leak_risk.",
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildStemPrompt(input: StemDescriptionInput): string {
  const lines = [
    "You are an accessibility assistant producing a STRUCTURED description of a STEM visual",
    `(${input.visualType}) for a visually impaired learner. Style: ${input.style}.`,
    input.subject ? `Subject: ${input.subject}.` : "",
    input.yearGroup ? `Year group: ${input.yearGroup}.` : "",
    input.questionPrompt ? `Question prompt: ${input.questionPrompt}` : "",
    input.assessedSkill ? `Assessed skill: ${input.assessedSkill}` : "",
    "",
    "Rules: " + NEUTRALITY_RULES,
    input.style === "assessment_safe"
      ? "assessment_safe style: remove any interpretation or outcome; describe structure only."
      : input.style === "instructional"
        ? "instructional style: neutral description plus non-answer guidance on how to read it."
        : "descriptive style: neutral description of what is present.",
    "",
    "Provide structured sections covering, where relevant to the visual type:",
    "title; visual type; visible components; axes/labels/units; scale/range; table headers;",
    "apparatus/arrangement; a safe overall description; answer-risk warnings; staff review notes.",
    "",
    "Return STRICT JSON only, matching exactly this shape:",
    "{",
    '  "sections": [ { "heading": string, "content": string, "confidence": number (0..1) } ],',
    '  "structuredDescription": string,',
    '  "confidence": number (0..1),',
    '  "answerSensitiveFlags": [ { "text": string, "reason": string, "category": string, "severity": "low|medium|high" } ]',
    "}",
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildBrailleDraftPrompt(input: {
  subject?: string | null;
  yearGroup?: string | null;
}): string {
  return [
    "You are assisting with a DRAFT-ONLY, non-specialist transcription of a photographed",
    "page of Braille (UEB) into English. You are a general vision model, NOT a certified",
    "Braille OCR engine. Your output is a rough draft that a QTVI or Braille-literate",
    "specialist MUST verify. Be conservative and flag anything uncertain.",
    input.subject ? `Subject context: ${input.subject}.` : "",
    input.yearGroup ? `Year group: ${input.yearGroup}.` : "",
    "",
    "Return STRICT JSON only, matching exactly this shape:",
    "{",
    '  "draftText": string,',
    '  "confidence": number (0..1),',
    '  "flags": [ { "text": string, "reason": string, "category": string, "severity": "low|medium|high" } ]',
    "}",
    "For flags.category prefer one of: unclear_braille_cell, possible_contraction_issue,",
    "possible_number_sign_issue, possible_capitalisation_issue, line_order_uncertainty,",
    "word_spacing_uncertainty, subject_specific_term, low_ocr_confidence, low_image_quality.",
    "Keep confidence conservative (typically <= 0.6) because this is not specialist OCR.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Human-readable label for the context, used in mock/flags. */
export function contextLabel(context: VisualContext): string {
  return context.replace(/_/g, " ");
}
