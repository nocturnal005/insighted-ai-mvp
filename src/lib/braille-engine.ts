import type { AnswerSensitiveFlag, DescriptionStyle, LowConfidenceRegion, VisualType } from "@/lib/types";

/**
 * Mock AI services. All AI lives behind these clean functions so real OCR / vision /
 * language models can replace them later without touching product logic. Every output
 * is a DRAFT with confidence + flags — never presented as final.
 */
export interface TranscriptionResult {
  text: string;
  confidence: number;
  lowConfidenceRegions: LowConfidenceRegion[];
  engine: string;
}

const SAMPLES: { text: string; regions: LowConfidenceRegion[]; confidence: number }[] = [
  {
    text:
      "The water cycle has four main stages. First, the sun heats water in rivers and " +
      "oceans and it evaporates into the air. Next, the water vapour cools and condenses " +
      "to form clouds. Then precipitation falls as rain or snow. Finally, the water " +
      "collects and the cycle begins agan.",
    regions: [
      { text: "vapour", reason: "Possible missed UEB contraction" },
      { text: "agan", reason: "Low-confidence character cluster (likely 'again')" },
    ],
    confidence: 0.87,
  },
  {
    text:
      "Photosynthesis is how plants make food. They use sunlight, water and carbon " +
      "dioxide to produce glucose and oxygen. The green pigment chlorophyll absorbs the " +
      "light energy needed for this reactoin.",
    regions: [
      { text: "chlorophyll", reason: "Technical term — confirm spelling against source" },
      { text: "reactoin", reason: "Low-confidence cluster (likely 'reaction')" },
    ],
    confidence: 0.84,
  },
  {
    text:
      "In 1066 William of Normandy defeated King Harold at the Battle of Hastings. This " +
      "event changed England because the Normans brought new laws, castles and the feudal " +
      "system. Many Anglo-Saxon nobles lost there land.",
    regions: [{ text: "there", reason: "Possible homophone error (likely 'their')" }],
    confidence: 0.9,
  },
];

export class MockBrailleEngine {
  readonly name = "mock-v1";

  async transcribe(seed: string): Promise<TranscriptionResult> {
    await new Promise((r) => setTimeout(r, 700));
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const sample = SAMPLES[h % SAMPLES.length];
    return { text: sample.text, confidence: sample.confidence, lowConfidenceRegions: sample.regions, engine: this.name };
  }
}

export function getBrailleEngine() {
  return new MockBrailleEngine();
}

/**
 * Simulates an OCR pass over a known ground-truth string by injecting realistic
 * Braille-OCR errors (dropped characters, homophones, contraction slips). This lets the
 * evaluation harness produce believable, non-zero CER/WER while the engine is still a
 * mock. When a real engine is wired, the harness calls `engine.transcribe(image)` on the
 * sample's image instead — this helper is only the placeholder predictor.
 */
export function simulateOcr(groundTruth: string): string {
  return groundTruth
    .replace(/\bagain\b/i, "agan") // dropped character
    .replace(/\btheir\b/i, "there") // homophone confusion
    .replace(/\bvapour\b/i, "vapor") // missed contraction / spelling
    .replace(/\breaction\b/i, "reactoin"); // transposed characters
}

/** Mock vision: draft a neutral description of an assessment / lesson visual. */
export function draftVisualDescription(_title: string): {
  description: string;
  flags: AnswerSensitiveFlag[];
} {
  return {
    description:
      "The image shows a line graph on a labelled grid. The horizontal axis is titled " +
      "'Time (seconds)' and the vertical axis is titled 'Distance (metres)'. A single " +
      "line begins at the origin and rises steadily from left to right before levelling " +
      "off near the top right of the grid.",
    flags: [
      { text: "rises steadily", reason: "Describes the trend — may hint at the answer in an assessment" },
      { text: "levelling off", reason: "Interpretation of gradient — redact for Tier 0 assessment use" },
    ],
  };
}

// ── STEM structured description ─────────────────────────────────────────────

export const VISUAL_TYPE_LABELS: Record<VisualType, string> = {
  line_graph: "Line graph",
  bar_chart: "Bar chart",
  table: "Table",
  labelled_diagram: "Labelled diagram",
  science_diagram: "Science diagram",
  experiment_setup: "Experiment setup",
};

/** The structured sections we recommend a staff member fills in, per visual type. */
export const STRUCTURE_TEMPLATES: Record<VisualType, string[]> = {
  line_graph: ["Title", "Axes & units", "Scale & range", "Shape of the line", "Key points"],
  bar_chart: ["Title", "Categories", "Axis & units", "Tallest / shortest bars", "Comparison"],
  table: ["Title", "Column headings", "Row headings", "Notable cells", "Units"],
  labelled_diagram: ["Title", "Overall structure", "Labelled parts", "Connections", "Direction of flow"],
  science_diagram: ["Title", "Apparatus shown", "Arrangement", "Labels", "Measurements"],
  experiment_setup: ["Title", "Equipment list", "Arrangement", "Connections", "Safety notes"],
};

/**
 * Mock STEM drafting. Produces a structured first draft based on the visual type and
 * chosen style. Assessment-safe style omits interpretation; instructional adds guidance.
 */
export function draftStemDescription(
  visualType: VisualType,
  style: DescriptionStyle,
): { description: string; flags: AnswerSensitiveFlag[] } {
  const sections = STRUCTURE_TEMPLATES[visualType];
  const base = sections
    .map((s) => {
      switch (s) {
        case "Title":
          return "Title: the diagram is titled by the teacher in the source material.";
        case "Axes & units":
          return "Axes & units: horizontal axis 'Time (s)', vertical axis 'Distance (m)'.";
        case "Scale & range":
          return "Scale & range: each gridline is 1 unit; the line spans the full grid.";
        case "Shape of the line":
          return "Shape of the line: a single continuous line across the grid.";
        case "Key points":
          return "Key points: the line starts at the origin and ends near the top-right.";
        default:
          return `${s}: [staff to complete from the source visual].`;
      }
    })
    .join("\n");

  const flags: AnswerSensitiveFlag[] = [];
  let description = base;

  if (style === "instructional") {
    description += "\n\nGuidance for the learner: trace the line left to right and note where it changes.";
  }
  if (style !== "assessment_safe") {
    flags.push({ text: "ends near the top-right", reason: "States the outcome — may reveal the answer" });
  }
  if (style === "assessment_safe") {
    description = description.replace(
      "Key points: the line starts at the origin and ends near the top-right.",
      "Key points: [interpretation removed for assessment-safe use].",
    );
  }

  return { description, flags };
}
