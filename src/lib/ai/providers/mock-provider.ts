/**
 * Mock AI provider.
 *
 * Deterministic, offline stand-ins for every AI capability so local demos work with zero
 * configuration. The Braille samples are the same ones the original `braille-engine.ts`
 * shipped, now returned in the provider result shape with uncertainty flags and full
 * provenance (`mode: "mock"`). No network, no secrets.
 */
import type {
  BrailleOcrInput,
  BrailleOcrResult,
  StemDescriptionInput,
  StemDescriptionResult,
  UncertaintyFlag,
  VisualDescriptionInput,
  VisualDescriptionResult,
} from "../types";
import { startRun, finishMeta } from "../meta";
import { PROMPT_VERSIONS } from "../prompts";
import { effectiveConfidence } from "../confidence";
import { makeFlag, requiresSpecialistReviewFlag } from "../uncertainty";
import { assessmentContextFlags } from "../safety";

const MODEL = "mock-v1";
const ENGINE = "mock-v1";

const BRAILLE_SAMPLES: { text: string; flags: { text: string; reason: string; category: UncertaintyFlag["category"] }[]; confidence: number }[] = [
  {
    text:
      "The water cycle has four main stages. First, the sun heats water in rivers and " +
      "oceans and it evaporates into the air. Next, the water vapour cools and condenses " +
      "to form clouds. Then precipitation falls as rain or snow. Finally, the water " +
      "collects and the cycle begins agan.",
    flags: [
      { text: "vapour", reason: "Possible missed UEB contraction", category: "possible_contraction_issue" },
      { text: "agan", reason: "Low-confidence character cluster (likely 'again')", category: "unclear_braille_cell" },
    ],
    confidence: 0.87,
  },
  {
    text:
      "Photosynthesis is how plants make food. They use sunlight, water and carbon " +
      "dioxide to produce glucose and oxygen. The green pigment chlorophyll absorbs the " +
      "light energy needed for this reactoin.",
    flags: [
      { text: "chlorophyll", reason: "Technical term — confirm spelling against source", category: "subject_specific_term" },
      { text: "reactoin", reason: "Low-confidence cluster (likely 'reaction')", category: "unclear_braille_cell" },
    ],
    confidence: 0.84,
  },
  {
    text:
      "In 1066 William of Normandy defeated King Harold at the Battle of Hastings. This " +
      "event changed England because the Normans brought new laws, castles and the feudal " +
      "system. Many Anglo-Saxon nobles lost there land.",
    flags: [
      { text: "there", reason: "Possible homophone error (likely 'their')", category: "possible_capitalisation_issue" },
    ],
    confidence: 0.9,
  },
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

export async function transcribeBrailleMock(input: BrailleOcrInput): Promise<BrailleOcrResult> {
  const timer = startRun();
  await new Promise((r) => setTimeout(r, 200));
  const sample = BRAILLE_SAMPLES[hashSeed(input.taskId || input.title) % BRAILLE_SAMPLES.length];

  const sampleFlags = sample.flags.map((f) =>
    makeFlag({ text: f.text, reason: f.reason, category: f.category, severity: "medium" }),
  );
  // The specialist-review requirement is a hard workflow gate, not an OCR-confidence
  // signal, so it is prepended AFTER confidence is computed from the OCR-quality flags.
  const flags: UncertaintyFlag[] = [requiresSpecialistReviewFlag(), ...sampleFlags];

  return {
    draftText: sample.text,
    confidence: effectiveConfidence(sample.confidence, sampleFlags),
    flags,
    rawBraille: null,
    rawCells: null,
    meta: finishMeta(timer, {
      provider: "mock",
      model: MODEL,
      engineVersion: ENGINE,
      promptVersion: PROMPT_VERSIONS.mockBraille,
      mode: "mock",
    }),
    requiresSpecialistReview: true,
  };
}

export async function describeVisualMock(input: VisualDescriptionInput): Promise<VisualDescriptionResult> {
  const timer = startRun();
  await new Promise((r) => setTimeout(r, 200));

  const answerSensitiveFlags: UncertaintyFlag[] = [
    makeFlag({
      text: "rises steadily",
      reason: "Describes the trend — may hint at the answer in an assessment",
      category: "trend_revealed",
      severity: "medium",
    }),
    makeFlag({
      text: "levelling off",
      reason: "Interpretation of gradient — redact for Tier 0 assessment use",
      category: "relationship_interpreted",
      severity: "medium",
    }),
    ...assessmentContextFlags({
      context: input.context,
      questionPrompt: input.questionPrompt,
      assessedSkill: input.assessedSkill,
    }),
  ];

  return {
    visualType: "line_graph",
    neutralDescription:
      "The image shows a line graph on a labelled grid. The horizontal axis is titled " +
      "'Time (seconds)' and the vertical axis is titled 'Distance (metres)'. A single line " +
      "begins at the origin and continues across the grid toward the top right.",
    visibleElements: ["labelled grid", "single plotted line", "axis titles", "origin marker"],
    labelsDetected: ["Time (seconds)", "Distance (metres)"],
    spatialLayout: "Axes bottom and left; the line runs from lower-left to upper-right.",
    answerSensitiveFlags,
    confidence: effectiveConfidence(0.8, answerSensitiveFlags),
    meta: finishMeta(timer, {
      provider: "mock",
      model: MODEL,
      engineVersion: ENGINE,
      promptVersion: PROMPT_VERSIONS.mockVisual,
      mode: "mock",
    }),
    requiresHumanApproval: true,
  };
}

const STRUCTURE_TEMPLATES: Record<StemDescriptionInput["visualType"], string[]> = {
  line_graph: ["Title", "Axes & units", "Scale & range", "Shape of the line", "Key points"],
  bar_chart: ["Title", "Categories", "Axis & units", "Tallest / shortest bars", "Comparison"],
  table: ["Title", "Column headings", "Row headings", "Notable cells", "Units"],
  labelled_diagram: ["Title", "Overall structure", "Labelled parts", "Connections", "Direction of flow"],
  science_diagram: ["Title", "Apparatus shown", "Arrangement", "Labels", "Measurements"],
  experiment_setup: ["Title", "Equipment list", "Arrangement", "Connections", "Safety notes"],
};

export async function describeStemMock(input: StemDescriptionInput): Promise<StemDescriptionResult> {
  const timer = startRun();
  await new Promise((r) => setTimeout(r, 200));

  const headings = STRUCTURE_TEMPLATES[input.visualType];
  const answerSensitiveFlags: UncertaintyFlag[] = [];

  const sections = headings.map((heading) => {
    let content: string;
    switch (heading) {
      case "Title":
        content = "The diagram is titled by the teacher in the source material.";
        break;
      case "Axes & units":
        content = "Horizontal axis 'Time (s)', vertical axis 'Distance (m)'.";
        break;
      case "Scale & range":
        content = "Each gridline is 1 unit; the line spans the full grid.";
        break;
      case "Shape of the line":
        content =
          input.style === "assessment_safe"
            ? "[interpretation removed for assessment-safe use]."
            : "A single continuous line across the grid.";
        break;
      case "Key points":
        content =
          input.style === "assessment_safe"
            ? "[interpretation removed for assessment-safe use]."
            : "The line starts at the origin and ends near the top-right.";
        break;
      default:
        content = "[staff to complete from the source visual].";
    }
    return { heading, content, confidence: 0.8 };
  });

  if (input.style !== "assessment_safe") {
    answerSensitiveFlags.push(
      makeFlag({
        text: "ends near the top-right",
        reason: "States the outcome — may reveal the answer",
        category: "answer_value_revealed",
        severity: "medium",
      }),
    );
  }

  let structuredDescription = sections.map((s) => `${s.heading}: ${s.content}`).join("\n");
  if (input.style === "instructional") {
    structuredDescription += "\n\nGuidance for the learner: trace the line left to right and note where it changes.";
  }

  return {
    structuredDescription,
    sections,
    answerSensitiveFlags,
    confidence: effectiveConfidence(0.8, answerSensitiveFlags),
    meta: finishMeta(timer, {
      provider: "mock",
      model: MODEL,
      engineVersion: ENGINE,
      promptVersion: PROMPT_VERSIONS.mockStem,
      mode: "mock",
    }),
    requiresHumanApproval: true,
  };
}

/** Deterministic simulated OCR for the mock quality harness (text-only samples). */
export function simulateOcrMock(groundTruth: string): string {
  return groundTruth
    .replace(/\bagain\b/i, "agan")
    .replace(/\btheir\b/i, "there")
    .replace(/\bvapour\b/i, "vapor")
    .replace(/\breaction\b/i, "reactoin");
}
