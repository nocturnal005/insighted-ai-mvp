// Domain model for the InsightEd AI MVP.

export type UserRole = "teaching_assistant" | "teacher" | "qtvi" | "senco" | "admin";

export type TaskStatus = "draft" | "needs_review" | "approved" | "rejected" | "archived";
export type TranscriptionStatus = "draft" | "verified";
export type HintTier = "tier_0" | "tier_1" | "tier_2";
export type ApprovalStatus = "draft" | "approved";
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

export interface Transcription {
  draftText: string;
  editedText: string;
  finalText: string | null;
  status: TranscriptionStatus;
  confidence: number;
  lowConfidenceRegions: LowConfidenceRegion[];
  engine: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
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
  teacherComments: string; // editable, AI-suggested then staff-owned
  learnerSummary: string; // short, learner-friendly
  status: ApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
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
}

export interface VisualDescriptionTask {
  id: string;
  organisationId: string;
  title: string;
  subject: string | null;
  yearGroup: string | null;
  pupilId: string | null;
  context: "lesson" | "assessment";
  hintTier: HintTier;
  uploadId: string | null;
  draftDescription: string;
  editedDescription: string;
  answerSensitiveFlags: AnswerSensitiveFlag[];
  status: TaskStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  exportedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
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
  answerSensitiveFlags: AnswerSensitiveFlag[];
  status: TaskStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  exportedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Upload {
  id: string;
  organisationId: string;
  taskId: string;
  module: "braille" | "visual" | "stem";
  fileName: string;
  fileType: string;
  byteSize: number;
  dataUrl: string;
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
  imageDataUrl: string | null;
  prediction: string | null;
  cer: number | null;
  wer: number | null;
  lastRunAt: string | null;
  createdByName: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  organisationId: string;
  actorId: string | null;
  actorName: string;
  action: string;
  objectType: string;
  objectLabel: string;
  createdAt: string;
}
