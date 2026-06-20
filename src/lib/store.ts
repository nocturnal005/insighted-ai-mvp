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

function seed(): Db {
  const now = Date.now();
  const iso = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString();

  const users: User[] = [
    { id: "u_amelia", organisationId: ORG, fullName: "Amelia Stone", role: "teaching_assistant", email: "amelia@northgate.sch.uk" },
    { id: "u_david", organisationId: ORG, fullName: "David Okafor", role: "teacher", email: "david@northgate.sch.uk" },
    { id: "u_priya", organisationId: ORG, fullName: "Priya Sharma", role: "qtvi", email: "priya@northgate.sch.uk" },
    { id: "u_helen", organisationId: ORG, fullName: "Helen Wright", role: "senco", email: "helen@northgate.sch.uk" },
    { id: "u_marcus", organisationId: ORG, fullName: "Marcus Bell", role: "admin", email: "marcus@northgate.sch.uk" },
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
        status: "verified",
        confidence: 0.9,
        lowConfidenceRegions: [{ text: "there", reason: "Possible homophone error (likely 'their')" }],
        engine: "mock-v1",
        verifiedBy: "u_david",
        verifiedAt: iso(180),
      },
      feedback: {
        summary: "AI draft flagged 1 spelling item for your review.",
        findings: { spelling: ['"there" → suggested "their (check homophone)"'], contractions: [], formatting: [], unclear: [] },
        teacherComments: "Strong factual recall. Review the their/there point together.",
        learnerSummary: "Great work on the key dates — let's check one spelling next time.",
        status: "approved",
        approvedBy: "u_david",
        approvedAt: iso(174),
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
      status: "needs_review",
      createdBy: "u_amelia",
      assignedTo: "u_priya",
      uploadId: null,
      transcription: {
        draftText: "The water cycle has four main stages... Finally, the water collects and the cycle begins agan.",
        editedText: "The water cycle has four main stages... Finally, the water collects and the cycle begins agan.",
        finalText: null,
        status: "draft",
        confidence: 0.87,
        lowConfidenceRegions: [
          { text: "vapour", reason: "Possible missed UEB contraction" },
          { text: "agan", reason: "Low-confidence character cluster (likely 'again')" },
        ],
        engine: "mock-v1",
        verifiedBy: null,
        verifiedAt: null,
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
      verifiedByName: "David Okafor",
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
      createdByName: "Priya Sharma",
      createdAt: iso(200),
    },
  ];

  const audit: AuditEntry[] = [
    { id: "a1", organisationId: ORG, actorId: "u_david", actorName: "David Okafor", action: "transcription.verify", objectType: "Braille review", objectLabel: "Battle of Hastings", createdAt: iso(180) },
    { id: "a2", organisationId: ORG, actorId: "u_david", actorName: "David Okafor", action: "feedback.approve", objectType: "Feedback report", objectLabel: "Battle of Hastings", createdAt: iso(174) },
    { id: "a3", organisationId: ORG, actorId: "u_david", actorName: "David Okafor", action: "export", objectType: "Feedback report", objectLabel: "Battle of Hastings", createdAt: iso(170) },
    { id: "a4", organisationId: ORG, actorId: "u_priya", actorName: "Priya Sharma", action: "visual.approve", objectType: "Visual description", objectLabel: "Distance/time graph", createdAt: iso(60) },
    { id: "a5", organisationId: ORG, actorId: "u_amelia", actorName: "Amelia Stone", action: "task.create", objectType: "Braille review", objectLabel: "The water cycle", createdAt: iso(90) },
  ];

  return { users, pupils, brailleTasks, visualTasks, stemTasks, uploads: [], corrections, evalSamples, audit, settings: { retentionDays: 365, trainOnData: false } };
}

const g = globalThis as unknown as { __insighted_db?: Db };
export const db: Db = g.__insighted_db ?? (g.__insighted_db = seed());

// ── Helpers ────────────────────────────────────────────────────────────────
let counter = 0;
export function id(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter}`;
}

export function recordAudit(entry: {
  actorId: string | null;
  actorName: string;
  action: string;
  objectType: string;
  objectLabel: string;
}): void {
  db.audit.unshift({ id: id("a"), organisationId: ORG, createdAt: new Date().toISOString(), ...entry });
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
  dataUrl: string;
  uploadedBy: User;
}): string {
  const upload: Upload = {
    id: id("up"),
    organisationId: ORG,
    taskId: params.taskId,
    module: params.module,
    fileName: params.fileName,
    fileType: params.fileType,
    byteSize: params.byteSize,
    dataUrl: params.dataUrl,
    uploadedBy: params.uploadedBy.id,
    createdAt: new Date().toISOString(),
  };
  db.uploads.push(upload);
  recordAudit({
    actorId: params.uploadedBy.id,
    actorName: params.uploadedBy.fullName,
    action: "upload.create",
    objectType: "Upload",
    objectLabel: params.fileName,
  });
  return upload.id;
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
}

export function findUser(userId: string): User | undefined {
  return db.users.find((u) => u.id === userId);
}

export function userName(userId: string | null): string {
  if (!userId) return "—";
  return db.users.find((u) => u.id === userId)?.fullName ?? "Unknown";
}

export function pupilLabel(pupilId: string | null): string | null {
  if (!pupilId) return null;
  const p = db.pupils.find((x) => x.id === pupilId);
  return p ? `${p.referenceCode} · ${p.yearGroup}` : null;
}
