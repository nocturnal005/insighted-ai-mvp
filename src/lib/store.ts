import type {
  AuditEntry,
  BrailleTask,
  CorrectionPair,
  EvalSample,
  Pupil,
  StemTask,
  Upload,
  User,
  VisualDescriptionTask,
} from "@/lib/types";
import { scorePair } from "@/lib/metrics";
import { ROLE_STAFF_LABEL } from "@/lib/rbac";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * In-memory data store for the runnable MVP. Seeded with realistic demo data so the app
 * is fully explorable with zero setup. State lives for the server process lifetime
 * (resets on restart). A `globalThis` singleton keeps it stable across hot reloads.
 *
 * This is the ONLY stateful module. Swapping it for Postgres/Supabase later is a
 * like-for-like change behind the same function signatures.
 */
interface Db {
  users: User[];
  pupils: Pupil[];
  brailleTasks: BrailleTask[];
  visualTasks: VisualDescriptionTask[];
  stemTasks: StemTask[];
  uploads: Upload[];
  corrections: CorrectionPair[];
  evalSamples: EvalSample[];
  audit: AuditEntry[];
  settings: { retentionDays: number; trainOnData: boolean };
}

const ORG = "org_northgate";
// INSIGHTED_DATA_DIR lets validation harnesses run against an isolated throwaway
// store instead of the local demo data. Unset in normal use.
const DATA_DIR = process.env.INSIGHTED_DATA_DIR || join(process.cwd(), ".insighted-data");
const UPLOAD_DIR = join(DATA_DIR, "uploads");
const DB_FILE = join(DATA_DIR, "db.json");

// Tracks whether local disk is writable. Serverless hosts (e.g. Vercel) mount a
// read-only filesystem outside /tmp, so mkdir/write there throws EROFS. Rather than
// crashing the whole app at import time, we detect that once and fall back to an
// in-memory-only demo store (state still resets on cold start either way).
let diskWritable = true;

function ensureDataDirs(): void {
  if (!diskWritable) return;
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch {
    diskWritable = false;
  }
}

function loadPersistedDb(): Db | null {
  if (!diskWritable) return null;
  try {
    if (!existsSync(DB_FILE)) return null;
    return JSON.parse(readFileSync(DB_FILE, "utf8")) as Db;
  } catch {
    return null;
  }
}

function saveDb(): void {
  if (!diskWritable) return;
  try {
    ensureDataDirs();
    if (!diskWritable) return;
    writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch {
    // A production database adapter should fail loudly; the local demo remains usable.
    diskWritable = false;
  }
}

function seed(): Db {
  const now = Date.now();
  const iso = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString();

  const users: User[] = [
    { id: "u_amelia", organisationId: ORG, fullName: "TA Staff", role: "teaching_assistant", email: "ta@northgate.sch.uk", brailleLiterate: true },
    { id: "u_david", organisationId: ORG, fullName: "Teaching Staff", role: "teacher", email: "teacher@northgate.sch.uk" },
    { id: "u_priya", organisationId: ORG, fullName: "QTVI Staff", role: "qtvi", email: "qtvi@northgate.sch.uk" },
    { id: "u_helen", organisationId: ORG, fullName: "SENCO Staff", role: "senco", email: "senco@northgate.sch.uk" },
    { id: "u_marcus", organisationId: ORG, fullName: "Admin Staff", role: "admin", email: "admin@northgate.sch.uk" },
  ];

  const pupils: Pupil[] = [
    { id: "p_001", organisationId: ORG, referenceCode: "VI-2026-001", yearGroup: "Year 9", supportNotes: "UEB Grade 2. Uses a Perkins brailler for class work." },
    { id: "p_002", organisationId: ORG, referenceCode: "VI-2026-002", yearGroup: "Year 10", supportNotes: "Partially sighted; large print and tactile diagrams." },
    { id: "p_003", organisationId: ORG, referenceCode: "VI-2026-003", yearGroup: "Year 11", supportNotes: "UEB Grade 2; exam access arrangements in place." },
  ];

  const brailleTasks: BrailleTask[] = [
    {
      id: "bt_1001",
      organisationId: ORG,
      title: "Year 11 history homework — Battle of Hastings",
      subject: "History",
      pupilId: "p_003",
      status: "approved",
      createdBy: "u_amelia",
      assignedTo: "u_david",
      uploadId: null,
      transcription: {
        draftText: "In 1066 William of Normandy defeated King Harold at the Battle of Hastings. Many Anglo-Saxon nobles lost there land.",
        editedText: "In 1066 William of Normandy defeated King Harold at the Battle of Hastings. Many Anglo-Saxon nobles lost their land.",
        finalText: "In 1066 William of Normandy defeated King Harold at the Battle of Hastings. Many Anglo-Saxon nobles lost their land.",
        status: "specialist_verified",
        confidence: 0.9,
        lowConfidenceRegions: [{ text: "there", reason: "Possible homophone error (likely 'their')" }],
        engine: "mock-v1",
        specialistVerifiedBy: "u_priya",
        specialistVerifiedAt: iso(180),
        specialistNotes: "Braille accuracy checked by QTVI before the teacher feedback stage.",
        brailleAccuracyFindings: ["Homophone corrected: there -> their"],
        subjectTeacherReviewedBy: "u_david",
        subjectTeacherReviewedAt: iso(176),
      },
      feedback: {
        summary: "AI draft flagged 1 spelling item for your review.",
        findings: { spelling: ['"there" → suggested "their (check homophone)"'], contractions: [], formatting: [], unclear: [] },
        specialistNotes: "QTVI verified the English transcription. Subject feedback below is not a Braille accuracy judgement.",
        subjectFeedback: "Strong factual recall. Review the their/there point together.",
        teacherComments: "Strong factual recall. Review the their/there point together.",
        learnerSummary: "Great work on the key dates — let's check one spelling next time.",
        reviewWarnings: [],
        approvedFinalComments: "Strong factual recall. Review the their/there point together.",
        status: "approved",
        approvedBy: "u_david",
        approvedAt: iso(174),
        teacherReviewedBy: "u_david",
        teacherReviewedAt: iso(174),
        createdAt: iso(175),
      },
      rejectionReason: null,
      exportedAt: iso(170),
      createdAt: iso(240),
      updatedAt: iso(170),
    },
    {
      id: "bt_1002",
      organisationId: ORG,
      title: "Year 9 science — the water cycle",
      subject: "Science",
      pupilId: "p_001",
      status: "needs_specialist_review",
      createdBy: "u_amelia",
      assignedTo: "u_priya",
      uploadId: null,
      transcription: {
        draftText: "The water cycle has four main stages... Finally, the water collects and the cycle begins agan.",
        editedText: "The water cycle has four main stages... Finally, the water collects and the cycle begins agan.",
        finalText: null,
        status: "needs_specialist_review",
        confidence: 0.87,
        lowConfidenceRegions: [
          { text: "vapour", reason: "Possible missed UEB contraction" },
          { text: "agan", reason: "Low-confidence character cluster (likely 'again')" },
        ],
        engine: "mock-v1",
        specialistVerifiedBy: null,
        specialistVerifiedAt: null,
        specialistNotes: "",
        brailleAccuracyFindings: [],
        subjectTeacherReviewedBy: null,
        subjectTeacherReviewedAt: null,
      },
      feedback: null,
      rejectionReason: null,
      exportedAt: null,
      createdAt: iso(90),
      updatedAt: iso(80),
    },
  ];

  const visualTasks: VisualDescriptionTask[] = [
    {
      id: "vd_2001",
      organisationId: ORG,
      title: "Physics mock — distance/time graph",
      subject: "Physics",
      yearGroup: "Year 11",
      pupilId: "p_003",
      context: "assessment",
      hintTier: "tier_0",
      uploadId: null,
      draftDescription:
        "The image shows a line graph on a labelled grid. The horizontal axis is titled 'Time (seconds)' and the vertical axis is titled 'Distance (metres)'.",
      editedDescription:
        "The image shows a line graph on a labelled grid. The horizontal axis is titled 'Time (seconds)' and the vertical axis is titled 'Distance (metres)'.",
      answerSensitiveFlags: [{ text: "rises steadily", reason: "Describes the trend — may hint at the answer" }],
      status: "approved",
      approvedBy: "u_priya",
      approvedAt: iso(60),
      rejectionReason: null,
      exportedAt: null,
      createdBy: "u_david",
      createdAt: iso(120),
      updatedAt: iso(60),
    },
  ];

  const stemTasks: StemTask[] = [];

  // Captured correction from the already-verified history task (there → their).
  const histDraft = brailleTasks[0].transcription!.draftText;
  const histFinal = brailleTasks[0].transcription!.finalText!;
  const histScore = scorePair(histDraft, histFinal);
  const corrections: CorrectionPair[] = [
    {
      id: "corr_seed1",
      taskId: brailleTasks[0].id,
      taskTitle: brailleTasks[0].title,
      draftText: histDraft,
      finalText: histFinal,
      cer: histScore.cer,
      wer: histScore.wer,
      engine: "mock-v1",
      verifiedByName: "Teaching Staff",
      createdAt: iso(174),
    },
  ];

  // One ground-truth evaluation sample (replace with real labelled images during pilot).
  const evalSamples: EvalSample[] = [
    {
      id: "eval_seed1",
      label: "Year 9 science — water cycle (clean embossed Grade 2)",
      groundTruthText:
        "The water cycle has four main stages. First, the sun heats water in rivers and oceans and it evaporates into the air. Next, the water vapour cools and condenses to form clouds. Then precipitation falls as rain or snow. Finally, the water collects and the cycle begins again.",
      imageDataUrl: null,
      prediction: null,
      cer: null,
      wer: null,
      lastRunAt: null,
      createdByName: "QTVI Staff",
      createdAt: iso(200),
    },
  ];

  const audit: AuditEntry[] = [
    { id: "a1", organisationId: ORG, actorId: "u_priya", actorName: "QTVI Staff", actorRole: "qtvi", action: "transcription.specialist_verify", objectType: "Braille review", objectLabel: "Battle of Hastings", taskId: "bt_1001", previousStatus: "needs_specialist_review", newStatus: "specialist_verified", createdAt: iso(180) },
    { id: "a2", organisationId: ORG, actorId: "u_david", actorName: "Teaching Staff", actorRole: "teacher", action: "feedback.approve", objectType: "Feedback report", objectLabel: "Battle of Hastings", taskId: "bt_1001", previousStatus: "teacher_review", newStatus: "approved", createdAt: iso(174) },
    { id: "a3", organisationId: ORG, actorId: "u_david", actorName: "Teaching Staff", actorRole: "teacher", action: "export.completed", objectType: "Feedback report", objectLabel: "Battle of Hastings", taskId: "bt_1001", createdAt: iso(170) },
    { id: "a4", organisationId: ORG, actorId: "u_priya", actorName: "QTVI Staff", actorRole: "qtvi", action: "visual.approve", objectType: "Visual description", objectLabel: "Distance/time graph", taskId: "vd_2001", previousStatus: "draft", newStatus: "approved", createdAt: iso(60) },
    { id: "a5", organisationId: ORG, actorId: "u_amelia", actorName: "TA Staff", actorRole: "teaching_assistant", action: "task.create", objectType: "Braille review", objectLabel: "The water cycle", taskId: "bt_1002", newStatus: "needs_specialist_review", createdAt: iso(90) },
  ];

  return { users, pupils, brailleTasks, visualTasks, stemTasks, uploads: [], corrections, evalSamples, audit, settings: { retentionDays: 365, trainOnData: false } };
}

ensureDataDirs();
const g = globalThis as unknown as { __insighted_db?: Db };
export const db: Db = g.__insighted_db ?? (g.__insighted_db = loadPersistedDb() ?? seed());
if (!existsSync(DB_FILE)) saveDb();

// ── Helpers ────────────────────────────────────────────────────────────────
let counter = 0;
export function id(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter}`;
}

export function recordAudit(entry: {
  actorId: string | null;
  actorName: string;
  actorRole?: AuditEntry["actorRole"];
  action: string;
  objectType: string;
  objectLabel: string;
  taskId?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  // AI/OCR run provenance for `ai.*` / `eval.*` actions.
  provider?: string | null;
  model?: string | null;
  confidence?: number | null;
  processingMs?: number | null;
  aiMode?: AuditEntry["aiMode"];
  promptVersion?: string | null;
  flagSummary?: string[] | null;
}): void {
  db.audit.unshift({ id: id("a"), organisationId: ORG, createdAt: new Date().toISOString(), ...entry });
  saveDb();
}

/**
 * Records an uploaded file as a tracked Upload entity (file id, type, size, uploader,
 * date, task id) and writes an `upload.create` audit entry. Returns the new upload id.
 * Tasks reference the upload by id rather than embedding the image inline.
 */
export function createUpload(params: {
  taskId: string;
  module: Upload["module"];
  fileName: string;
  fileType: string;
  byteSize: number;
  data: Buffer;
  uploadedBy: User;
}): string {
  const uploadId = id("up");
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "upload";
  const storagePath = join(UPLOAD_DIR, `${uploadId}-${safeName}`);

  let wroteToDisk = false;
  if (diskWritable) {
    try {
      ensureDataDirs();
      if (diskWritable) {
        writeFileSync(storagePath, params.data);
        wroteToDisk = true;
      }
    } catch {
      diskWritable = false;
    }
  }

  const upload: Upload = {
    id: uploadId,
    organisationId: ORG,
    taskId: params.taskId,
    module: params.module,
    fileName: params.fileName,
    fileType: params.fileType,
    byteSize: params.byteSize,
    // On a read-only filesystem (e.g. Vercel), keep the bytes in memory instead of on disk.
    storagePath: wroteToDisk ? storagePath : "",
    dataUrl: wroteToDisk ? undefined : `data:${params.fileType};base64,${params.data.toString("base64")}`,
    uploadedBy: params.uploadedBy.id,
    createdAt: new Date().toISOString(),
  };
  db.uploads.push(upload);
  recordAudit({
    actorId: params.uploadedBy.id,
    actorName: params.uploadedBy.fullName,
    actorRole: params.uploadedBy.role,
    action: "upload.create",
    objectType: "Upload",
    objectLabel: params.fileName,
    taskId: params.taskId,
  });
  return upload.id;
}

/** Look up a tracked Upload by its own id (used by eval samples that reference an upload). */
export function getUploadById(uploadId: string): Upload | undefined {
  return db.uploads.find((u) => u.id === uploadId);
}

/** Read upload bytes without base64-encoding them for an RSC/client payload. */
export function uploadBytes(upload: Upload): Buffer | null {
  if (upload.dataUrl) {
    const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(upload.dataUrl);
    if (!match) return null;
    try {
      return match[2]
        ? Buffer.from(match[3], "base64")
        : Buffer.from(decodeURIComponent(match[3]), "utf8");
    } catch {
      return null;
    }
  }
  try {
    return upload.storagePath ? readFileSync(upload.storagePath) : null;
  } catch {
    return null;
  }
}

/** Remove a single tracked upload (file + metadata). Used when deleting an eval sample. */
export function deleteUploadById(uploadId: string): void {
  const upload = db.uploads.find((u) => u.id === uploadId);
  if (!upload) return;
  try {
    if (upload.storagePath && existsSync(upload.storagePath)) unlinkSync(upload.storagePath);
  } catch {
    // Continue removing metadata even if the file is already gone.
  }
  db.uploads = db.uploads.filter((u) => u.id !== uploadId);
  saveDb();
}

export function uploadDataUrl(upload: Upload): string {
  if (upload.dataUrl) return upload.dataUrl;
  try {
    const data = readFileSync(upload.storagePath);
    return `data:${upload.fileType};base64,${data.toString("base64")}`;
  } catch {
    return "";
  }
}

/**
 * Captures a labelled (AI draft → verified final) pair when a transcription is verified.
 * The CER/WER measure how much the human had to correct the AI — free, real eval data.
 */
export function recordCorrection(params: {
  taskId: string;
  taskTitle: string;
  draftText: string;
  finalText: string;
  engine: string;
  verifiedByName: string;
}): void {
  const s = scorePair(params.draftText, params.finalText);
  db.corrections.unshift({
    id: id("corr"),
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    draftText: params.draftText,
    finalText: params.finalText,
    cer: s.cer,
    wer: s.wer,
    engine: params.engine,
    verifiedByName: params.verifiedByName,
    createdAt: new Date().toISOString(),
  });
  saveDb();
}

export function persistDb(): void {
  saveDb();
}

export function purgeExpiredUploads(retentionDays: number): Upload[] {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const expired = db.uploads.filter((u) => new Date(u.createdAt).getTime() < cutoff);
  if (!expired.length) return [];

  for (const upload of expired) {
    try {
      if (upload.storagePath && existsSync(upload.storagePath)) unlinkSync(upload.storagePath);
    } catch {
      // Continue purging metadata so the UI no longer exposes expired material.
    }
    for (const task of [...db.brailleTasks, ...db.visualTasks, ...db.stemTasks]) {
      if (task.uploadId === upload.id) task.uploadId = null;
    }
  }

  db.uploads = db.uploads.filter((u) => !expired.some((x) => x.id === u.id));
  saveDb();
  return expired;
}

export function findUser(userId: string): User | undefined {
  return db.users.find((u) => u.id === userId);
}

/**
 * Display label for a staff member. Derived from the user's ROLE rather than any
 * stored personal name, so identities stay role-based everywhere (including for
 * records written before this convention).
 */
export function userName(userId: string | null): string {
  if (!userId) return "—";
  const user = db.users.find((u) => u.id === userId);
  return user ? ROLE_STAFF_LABEL[user.role] : "Unknown";
}

export function pupilLabel(pupilId: string | null): string | null {
  if (!pupilId) return null;
  const p = db.pupils.find((x) => x.id === pupilId);
  return p ? `${p.referenceCode} · ${p.yearGroup}` : null;
}
