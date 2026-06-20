import type { FeedbackFindings } from "@/lib/types";

/**
 * Generates a *draft* feedback report from a verified transcription.
 * Transparent heuristics keep it explainable. Everything here is an AI SUGGESTION the
 * teacher edits and approves — nothing is presented as final.
 */
const COMMON_MISSPELLINGS: Record<string, string> = {
  agan: "again",
  reactoin: "reaction",
  recieve: "receive",
  seperate: "separate",
  definately: "definitely",
  occured: "occurred",
  there: "their (check homophone)",
};

export interface FeedbackDraft {
  summary: string;
  findings: FeedbackFindings;
  teacherComments: string;
  learnerSummary: string;
}

export function generateFeedback(text: string): FeedbackDraft {
  const spelling: string[] = [];
  const contractions: string[] = [];
  const formatting: string[] = [];
  const unclear: string[] = [];

  for (const raw of text.split(/\s+/)) {
    const w = raw.toLowerCase().replace(/[^a-z]/g, "");
    if (COMMON_MISSPELLINGS[w]) spelling.push(`"${w}" → suggested "${COMMON_MISSPELLINGS[w]}"`);
  }

  text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.split(/\s+/).length > 32)
    .forEach(() => formatting.push("Long sentence — check Braille line/structure breaks."));

  if (/\bvapour\b/i.test(text)) contractions.push('Word "vapour" — confirm the intended UEB contraction was captured.');
  if (/\bchlorophyll\b/i.test(text)) contractions.push('Technical term "chlorophyll" — verify against the source text.');

  if (!spelling.length && !contractions.length) {
    unclear.push("No automatic issues detected — staff review still required before use.");
  }

  const counts = [
    spelling.length && `${spelling.length} spelling`,
    contractions.length && `${contractions.length} contraction`,
    formatting.length && `${formatting.length} formatting`,
  ].filter(Boolean);

  const summary = counts.length
    ? `AI draft flagged ${counts.join(", ")} item(s) for your review.`
    : "AI draft found no obvious issues. Staff review still required.";

  // Suggested, editable starting points for the teacher.
  const teacherComments =
    spelling.length || contractions.length
      ? "Good effort overall. Review the flagged spelling/contraction points together and re-attempt those words."
      : "Clear, well-structured work. Confirm the transcription against the original before marking.";

  const learnerSummary =
    "Well done on completing this. There are a couple of small things to check together — " +
    "we'll go through them in our next session.";

  return { summary, findings: { spelling, contractions, formatting, unclear }, teacherComments, learnerSummary };
}
