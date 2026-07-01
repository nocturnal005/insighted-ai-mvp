import type { VisualType } from "@/lib/types";

/**
 * Legacy presentation data.
 *
 * The mock AI/OCR engine that used to live here has moved to the provider-based service
 * layer under `src/lib/ai/` (mock + real providers). Only the visual-type labels and the
 * suggested STEM structure templates remain — they are pure UI data used by pages, not AI.
 */

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
