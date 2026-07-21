/**
 * AI/OCR provider contract types.
 *
 * These describe the boundary between product logic and any AI/OCR provider (mock,
 * OpenAI vision, an external Braille OCR engine, or a Liblouis back-translator). Every
 * result carries provenance (`meta`) and an explicit "not final" marker so the product
 * layer can never silently treat AI output as verified.
 */

export type AiMode = "mock" | "real";

export type AiProviderName = "mock" | "openai";

export type BrailleOcrProviderName =
  | "mock"
  | "openai_vision_draft"
  | "external_braille_ocr"
  | "abc_braille_web"
  | "abc_openai_review";

export type ProcessingStatus =
  | "uploaded"
  | "preprocessing"
  | "ocr_running"
  | "vision_running"
  | "completed"
  | "failed";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  page?: number;
}

export type UncertaintyCategory =
  | "low_image_quality"
  | "low_ocr_confidence"
  | "unclear_braille_cell"
  | "possible_contraction_issue"
  | "possible_number_sign_issue"
  | "possible_capitalisation_issue"
  | "line_order_uncertainty"
  | "word_spacing_uncertainty"
  | "subject_specific_term"
  | "engine_disagreement"
  | "secondary_review_unavailable"
  | "answer_leak_risk"
  | "trend_revealed"
  | "comparison_revealed"
  | "answer_value_revealed"
  | "label_reveals_answer"
  | "visual_emphasis_reveals_answer"
  | "relationship_interpreted"
  | "cause_effect_implied"
  | "unnecessary_clue"
  | "requires_specialist_review"
  | "provider_unavailable"
  | "processing_failed"
  | "pdf_processing_pending"
  | "real_pupil_data_blocked";

export type UncertaintySeverity = "low" | "medium" | "high";

export interface UncertaintyFlag {
  id: string;
  text: string;
  reason: string;
  category: UncertaintyCategory;
  severity: UncertaintySeverity;
  bbox?: BoundingBox;
  suggestedAction?: string;
}

export interface AiProcessingMeta {
  provider: string;
  model: string;
  engineVersion: string;
  promptVersion: string;
  startedAt: string;
  completedAt: string;
  processingMs: number;
  mode: AiMode;
}

// ── Braille OCR ─────────────────────────────────────────────────────────────

export interface BrailleOcrInput {
  taskId: string;
  title: string;
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
  dataUrl?: string;
  imageUrl?: string;
  /**
   * Whole-page plus lossless, overlapping Braille review crops prepared server-side.
   * These are supplied only to the secondary vision reviewer; the primary OCR engine
   * continues to receive one image and remains the source of the draft transcription.
   */
  reviewImageUrls?: string[];
  subject?: string | null;
  yearGroup?: string | null;
  /**
   * Whether this task is linked to a pupil record. A boolean only — never a pupil name or
   * identifier. Used by the real-pupil-data safety guard; identifiers are never sent to a
   * provider.
   */
  hasLinkedPupil?: boolean;
}

export interface BraillePageResult {
  pageNumber: number;
  text: string;
  confidence: number;
  flags: UncertaintyFlag[];
}

export type BrailleReviewStatus = "completed" | "skipped" | "unavailable" | "failed";

export type BrailleDiscrepancyType =
  | "character"
  | "word"
  | "contraction"
  | "number_sign"
  | "capitalisation"
  | "punctuation"
  | "spacing"
  | "line_order"
  | "image_quality"
  | "other";

/** A second-opinion finding. It is evidence for specialist review, never an applied edit. */
export interface BrailleReviewDiscrepancy {
  lineNumber: number | null;
  sourceText: string;
  suggestedText: string | null;
  issueType: BrailleDiscrepancyType;
  reason: string;
  severity: UncertaintySeverity;
  confidence: number;
}

export interface BrailleHybridReview {
  status: BrailleReviewStatus;
  summary: string;
  discrepancies: BrailleReviewDiscrepancy[];
  rawBraille: string | null;
  liblouisText: string | null;
  liblouisAvailable: boolean;
  /** Exact character agreement between primary OCR and Liblouis, when both exist. */
  primaryLiblouisAgreement: number | null;
  reviewImageCount: number;
  model: string | null;
  processingMs: number;
}

export interface BrailleOcrResult {
  draftText: string;
  confidence: number;
  /** Distinguishes provider scores from evidence-derived consensus and absent scores. */
  confidenceBasis?: "provider" | "consensus" | "not_supplied";
  flags: UncertaintyFlag[];
  rawBraille?: string | null;
  rawCells?: unknown;
  pageResults?: BraillePageResult[];
  review?: BrailleHybridReview | null;
  /** Opaque request id, only when an external provider returns one. Never invented. */
  providerRequestId?: string | null;
  meta: AiProcessingMeta;
  /** Braille OCR output is never final — a specialist must verify accuracy. */
  requiresSpecialistReview: true;
}

// ── Visual (Assessment-Safe) description ────────────────────────────────────

export type DetectedVisualType =
  | "line_graph"
  | "bar_chart"
  | "table"
  | "labelled_diagram"
  | "science_diagram"
  | "experiment_setup"
  | "map"
  | "photo"
  | "other";

export type VisualContext =
  | "lesson"
  | "class_test"
  | "mock_assessment"
  | "formal_assessment_preparation"
  | "assessment";

export interface VisualDescriptionInput {
  taskId: string;
  title: string;
  fileName?: string;
  mimeType?: string;
  context: VisualContext;
  hintTier?: "tier_0" | "tier_1" | "tier_2";
  subject?: string | null;
  yearGroup?: string | null;
  questionPrompt?: string | null;
  assessedSkill?: string | null;
  dataUrl?: string;
  imageUrl?: string;
  /** Boolean only — never a pupil name/identifier. Drives the pupil-data safety guard. */
  hasLinkedPupil?: boolean;
}

export interface VisualDescriptionResult {
  visualType: DetectedVisualType;
  neutralDescription: string;
  visibleElements: string[];
  labelsDetected: string[];
  spatialLayout: string;
  answerSensitiveFlags: UncertaintyFlag[];
  confidence: number;
  meta: AiProcessingMeta;
  /** Visual descriptions are never exportable until a human approves them. */
  requiresHumanApproval: true;
}

// ── STEM structured description ──────────────────────────────────────────────

export type StemVisualType =
  | "line_graph"
  | "bar_chart"
  | "table"
  | "labelled_diagram"
  | "science_diagram"
  | "experiment_setup";

export interface StemDescriptionInput extends VisualDescriptionInput {
  visualType: StemVisualType;
  style: "descriptive" | "instructional" | "assessment_safe";
}

export interface StemSection {
  heading: string;
  content: string;
  confidence: number;
}

export interface StemDescriptionResult {
  structuredDescription: string;
  sections: StemSection[];
  answerSensitiveFlags: UncertaintyFlag[];
  confidence: number;
  meta: AiProcessingMeta;
  /** STEM descriptions are never exportable until a human approves them. */
  requiresHumanApproval: true;
}
