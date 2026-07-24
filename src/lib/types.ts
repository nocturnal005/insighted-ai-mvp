// Domain model for the Braivanta MVP.

export type UserRole = "teaching_assistant" | "teacher" | "qtvi" | "senco" | "admin";

export type TaskStatus =
  | "draft"
  | "ready_for_transcription"
  | "needs_review"
  | "needs_specialist_review"
  | "specialist_verified"
  | "teacher_review"
  | "approved"
  | "returned_for_correction"
  | "rejected"
  | "archived";
export type TranscriptionStatus =
  | "draft"
  | "needs_specialist_review"
  | "specialist_verified"
  | "returned_for_correction";
export type HintTier = "tier_0" | "tier_1" | "tier_2";
export type ApprovalStatus = "draft" | "teacher_review" | "approved";
export type VisualType =
  | "line_graph"
  | "bar_chart"
  | "table"
  | "labelled_diagram"
  | "science_diagram"
  | "experiment_setup";
export type DescriptionStyle = "descriptive" | "instructional" | "assessment_safe";

export interface User {
  id: string;
  organisationId: string;
  fullName: string;
  role: UserRole;
  email: string;
  brailleLiterate?: boolean;
}

export interface Pupil {
  id: string;
  organisationId: string;
  referenceCode: string;
  yearGroup: string;
  supportNotes: string;
}

export interface LowConfidenceRegion {
  text: string;
  reason: string;
}

/**
 * A full AI uncertainty flag, preserved on the task record so severity/category detail is
 * available for audit, quality review, and future analytics — even though the workflow UI
 * also renders a simpler flag shape. Never contains secrets or raw provider payloads.
 */
export interface StoredAiFlag {
  text: string;
  reason: string;
  category: string;
  severity: "low" | "medium" | "high";
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

export interface BrailleReviewDiscrepancy {
  lineNumber: number | null;
  sourceText: string;
  suggestedText: string | null;
  issueType: BrailleDiscrepancyType;
  reason: string;
  severity: "low" | "medium" | "high";
  confidence: number;
}

export interface BrailleHybridReview {
  status: BrailleReviewStatus;
  summary: string;
  discrepancies: BrailleReviewDiscrepancy[];
  rawBraille: string | null;
  backTranslationText: string | null;
  backTranslationAvailable: boolean;
  primaryBackTranslationAgreement: number | null;
  reviewImageCount: number;
  model: string | null;
  processingMs: number;
}

export interface Transcription {
  draftText: string;
  editedText: string;
  finalText: string | null;
  status: TranscriptionStatus;
  confidence: number;
  confidenceBasis?: "provider" | "consensus" | "not_supplied";
  lowConfidenceRegions: LowConfidenceRegion[];
  engine: string;
  specialistVerifiedBy: string | null;
  specialistVerifiedAt: string | null;
  specialistNotes: string;
  brailleAccuracyFindings: string[];
  subjectTeacherReviewedBy: string | null;
  subjectTeacherReviewedAt: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  // AI/OCR run provenance (optional so pre-existing seeded records stay valid).
  aiProvider?: string | null;
  aiModel?: string | null;
  aiMode?: "mock" | "real" | null;
  promptVersion?: string | null;
  processingMs?: number | null;
  // Full AI uncertainty flags (preserves severity/category the simple UI shape loses).
  aiFlags?: StoredAiFlag[] | null;
  // Opaque request id returned by an external OCR provider (only if it supplies one).
  aiRequestId?: string | null;
  // Evidence retained from the hybrid pipeline; suggestions are never auto-applied.
  rawBraille?: string | null;
  review?: BrailleHybridReview | null;
}

export interface FeedbackFindings {
  spelling: string[];
  contractions: string[];
  formatting: string[];
  unclear: string[];
}

export interface FeedbackReport {
  summary: string;
  findings: FeedbackFindings;
  specialistNotes: string;
  subjectFeedback: string;
  teacherComments: string; // editable, AI-suggested then staff-owned
  learnerSummary: string; // short, learner-friendly
  reviewWarnings: string[];
  approvedFinalComments: string | null;
  status: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  teacherReviewedBy: string | null;
  teacherReviewedAt: string | null;
  createdAt: string;
}

export interface BrailleTask {
  id: string;
  organisationId: string;
  title: string;
  subject: string | null;
  pupilId: string | null;
  status: TaskStatus;
  createdBy: string;
  assignedTo: string | null;
  uploadId: string | null;
  transcription: Transcription | null;
  feedback: FeedbackReport | null;
  rejectionReason: string | null;
  exportedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnswerSensitiveFlag {
  text: string;
  reason: string;
  type?:
    | "trend_revealed"
    | "comparison_revealed"
    | "answer_value_revealed"
    | "label_reveals_answer"
    | "visual_emphasis_reveals_answer"
    | "relationship_interpreted"
    | "cause_effect_implied"
    | "unnecessary_clue";
}

export interface VisualDescriptionTask {
  id: string;
  organisationId: string;
  title: string;
  subject: string | null;
  yearGroup: string | null;
  pupilId: string | null;
  context: "lesson" | "class_test" | "mock_assessment" | "formal_assessment_preparation" | "assessment";
  visualType?: VisualType;
  questionPrompt?: string | null;
  assessedSkill?: string | null;
  redactions?: string[];
  hintTier: HintTier;
  uploadId: string | null;
  draftDescription: string;
  editedDescription: string;
  /** The reviewer's edited text, captured just before the most recent re-run/regenerate so it
   *  is never silently overwritten. Optional for seed/back-compat. */
  previousDescription?: string | null;
  answerSensitiveFlags: AnswerSensitiveFlag[];
  status: TaskStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  exportedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // AI run provenance (optional for seed compatibility).
  aiProvider?: string | null;
  aiModel?: string | null;
  aiMode?: "mock" | "real" | null;
  confidence?: number | null;
  promptVersion?: string | null;
  processingMs?: number | null;
  aiFlags?: StoredAiFlag[] | null;
}

export interface StemTask {
  id: string;
  organisationId: string;
  title: string;
  subject: string | null;
  yearGroup: string | null;
  pupilId: string | null;
  visualType: VisualType;
  style: DescriptionStyle;
  uploadId: string | null;
  draftDescription: string;
  editedDescription: string;
  /** The reviewer's edited text, captured just before the most recent re-run/regenerate so it
   *  is never silently overwritten. Optional for seed/back-compat. */
  previousDescription?: string | null;
  answerSensitiveFlags: AnswerSensitiveFlag[];
  status: TaskStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  exportedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // AI run provenance (optional for seed compatibility).
  aiProvider?: string | null;
  aiModel?: string | null;
  aiMode?: "mock" | "real" | null;
  confidence?: number | null;
  promptVersion?: string | null;
  processingMs?: number | null;
  aiFlags?: StoredAiFlag[] | null;
}

export interface Upload {
  id: string;
  organisationId: string;
  taskId: string;
  module: "braille" | "visual" | "stem" | "quality";
  fileName: string;
  fileType: string;
  byteSize: number;
  storagePath: string;
  dataUrl?: string;
  uploadedBy: string;
  createdAt: string;
}

/**
 * A labelled (AI draft → staff-verified final) pair, captured automatically when a
 * transcription is verified. CER/WER here measure correction burden — how much the
 * human had to fix the AI. This is free training/eval data from the verify workflow.
 */
export interface CorrectionPair {
  id: string;
  taskId: string;
  taskTitle: string;
  draftText: string;
  finalText: string;
  cer: number;
  wer: number;
  engine: string;
  verifiedByName: string;
  createdAt: string;
}

/**
 * A held-out evaluation sample: an image (optional) + its known-correct transcription.
 * Running the harness scores the current engine's prediction against this ground truth.
 */
export interface EvalSample {
  id: string;
  label: string;
  groundTruthText: string;
  /** Preferred: the sample image stored as a tracked Upload (module "quality"). */
  uploadId?: string | null;
  /** Legacy inline image data — kept only for backwards compatibility with old records. */
  imageDataUrl: string | null;
  prediction: string | null;
  cer: number | null;
  wer: number | null;
  lastRunAt: string | null;
  createdByName: string;
  createdAt: string;
  // Which engine produced the last prediction (optional for seed compatibility).
  provider?: string | null;
  model?: string | null;
  confidence?: number | null;
  reviewDiscrepancyCount?: number | null;
  primaryLiblouisAgreement?: number | null;
  aiMode?: "mock" | "real" | null;
  flagSummary?: string[] | null;
  aiFlags?: StoredAiFlag[] | null;
  // Dataset provenance / governance metadata (all optional for seed compatibility).
  subject?: string | null;
  yearGroup?: string | null;
  brailleType?: "ueb_grade_1" | "ueb_grade_2" | "unknown" | null;
  imageQuality?: "good" | "medium" | "poor" | "unknown" | null;
  sampleSource?: "synthetic" | "anonymised_school_sample" | "other" | null;
  permissionStatus?: "synthetic" | "anonymised_only" | "approved_for_testing" | "not_approved" | null;
}

export interface AuditEntry {
  id: string;
  organisationId: string;
  actorId: string | null;
  actorName: string;
  actorRole?: UserRole;
  action: string;
  objectType: string;
  objectLabel: string;
  taskId?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  createdAt: string;
  // AI/OCR run provenance for `ai.*` and `eval.*` actions (optional otherwise).
  provider?: string | null;
  model?: string | null;
  confidence?: number | null;
  processingMs?: number | null;
  aiMode?: "mock" | "real" | null;
  promptVersion?: string | null;
  // Concise per-run flag summary, e.g. ["high: requires_specialist_review"]. Never raw text.
  flagSummary?: string[] | null;
}
