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
import { assessmentContextFlags, isAssessmentContext } from "../safety";

const MODEL = "mock-v1";
const ENGINE = "mock-v1";
const VISUAL_MODEL = "demo-fixture-v2";
const VISUAL_ENGINE = "demo-fixture-v2";

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

async function describeLineGraphMock(input: VisualDescriptionInput): Promise<VisualDescriptionResult> {
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
      "begins at the origin and continues across the grid toward the top right. The line rises steadily before levelling off.",
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

function demoVisualSearchText(input: VisualDescriptionInput): string {
  return [input.fileName, input.title, input.subject, input.questionPrompt, input.assessedSkill]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function describeDigestiveSystemMock(input: VisualDescriptionInput): Promise<VisualDescriptionResult> {
  const timer = startRun();
  await new Promise((resolve) => setTimeout(resolve, 200));

  const testsOrganFunctions = /\b(function|functions|role|roles|purpose|explain)\b/i.test(
    `${input.questionPrompt ?? ""} ${input.assessedSkill ?? ""}`,
  );
  const answerSensitiveFlags: UncertaintyFlag[] = [];
  let neutralDescription =
    "The image is a labelled front-view diagram of the human digestive system. " +
    "Labels identify the esophagus, liver, stomach, pancreas, large intestine, small intestine, appendix, rectum and anus. " +
    "The esophagus runs down from the mouth area to the stomach. The liver is shown above and to the left of the stomach, " +
    "with the pancreas beside the stomach. The small intestine is coiled in the centre of the abdomen and is surrounded by " +
    "the large intestine. The appendix is labelled near the lower part of the large intestine, and the rectum and anus are " +
    "shown at the lower end of the tract.";

  if (isAssessmentContext(input.context) && testsOrganFunctions) {
    const stomachPhrase = "The stomach breaks down food.";
    const intestinePhrase = "The small intestine absorbs nutrients.";
    neutralDescription += ` ${stomachPhrase} ${intestinePhrase}`;
    answerSensitiveFlags.push(
      makeFlag({
        text: stomachPhrase,
        reason: "Explains an organ function that the learner is being assessed on.",
        category: "answer_value_revealed",
        severity: "high",
      }),
      makeFlag({
        text: intestinePhrase,
        reason: "Supplies a function the learner is expected to explain.",
        category: "answer_value_revealed",
        severity: "high",
      }),
    );
  }

  answerSensitiveFlags.push(
    ...assessmentContextFlags({
      context: input.context,
      questionPrompt: input.questionPrompt,
      assessedSkill: input.assessedSkill,
    }),
  );

  return {
    visualType: "labelled_diagram",
    neutralDescription,
    visibleElements: ["human torso outline", "digestive tract", "leader lines", "nine printed organ labels"],
    labelsDetected: [
      "Esophagus",
      "Liver",
      "Stomach",
      "Pancreas",
      "Large intestine",
      "Small intestine",
      "Appendix",
      "Rectum",
      "Anus",
    ],
    spatialLayout: "Front-view torso with labels arranged on both sides and leader lines pointing to organs.",
    answerSensitiveFlags,
    confidence: effectiveConfidence(0.94, answerSensitiveFlags),
    meta: finishMeta(timer, {
      provider: "demo-fixture",
      model: VISUAL_MODEL,
      engineVersion: VISUAL_ENGINE,
      promptVersion: PROMPT_VERSIONS.mockVisual,
      mode: "mock",
    }),
    requiresHumanApproval: true,
  };
}

async function describeUnmatchedVisualMock(input: VisualDescriptionInput): Promise<VisualDescriptionResult> {
  const timer = startRun();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const answerSensitiveFlags: UncertaintyFlag[] = [
    makeFlag({
      text: "No matching demo fixture",
      reason: "Offline demo mode cannot inspect arbitrary images. Use a supported demo fixture or enable the real vision provider.",
      category: "processing_failed",
      severity: "high",
    }),
    ...assessmentContextFlags({
      context: input.context,
      questionPrompt: input.questionPrompt,
      assessedSkill: input.assessedSkill,
    }),
  ];

  return {
    visualType: "other",
    neutralDescription:
      "No image-specific demo description was produced. Review the source visual and complete the description manually, " +
      "or enable the configured real vision provider.",
    visibleElements: [],
    labelsDetected: [],
    spatialLayout: "",
    answerSensitiveFlags,
    confidence: 0,
    meta: finishMeta(timer, {
      provider: "demo-fixture",
      model: VISUAL_MODEL,
      engineVersion: VISUAL_ENGINE,
      promptVersion: PROMPT_VERSIONS.mockVisual,
      mode: "mock",
    }),
    requiresHumanApproval: true,
  };
}

export async function describeVisualMock(input: VisualDescriptionInput): Promise<VisualDescriptionResult> {
  const searchText = demoVisualSearchText(input);
  if (/digestive|d[-_ ]?system|oesophagus|esophagus/.test(searchText)) {
    return describeDigestiveSystemMock(input);
  }
  if (/line\s*graph|distance[-/ ]?time|time.*distance|gradient/.test(searchText)) {
    return describeLineGraphMock(input);
  }
  return describeUnmatchedVisualMock(input);
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
