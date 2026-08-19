import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import { neonConfig } from "@neondatabase/serverless";
import { can } from "../src/lib/rbac.ts";
import {
  buildLongitudinalEvidenceHistory,
  buildVerifiedEvidenceSummary,
} from "../src/lib/stage5-evidence.ts";
import type { BrailleTask, SpecialistCorrectionEvidence } from "../src/lib/types.ts";

const at = "2026-08-19T09:00:00.000Z";

function correction(
  id: string,
  transcriptionRunId: string | null,
  category: SpecialistCorrectionEvidence["evidenceCategory"] = "contraction",
): SpecialistCorrectionEvidence {
  return {
    id,
    taskId: "bt_stage5",
    transcriptionRunId,
    reviewItemId: transcriptionRunId ? `review-${transcriptionRunId}` : null,
    source: "flagged_passage",
    changeType: "text_replacement",
    machineText: "woter",
    previousText: "woter",
    reviewedText: "water",
    evidenceCategory: category,
    attribution: "unknown",
    reviewerId: "u_qtvi",
    reviewedAt: at,
    reviewerReason: "Controlled specialist source check.",
    sourceEvidenceAvailability: "partial",
    relatedStandardRuleIds: [],
    uncertaintyState: "review_required",
  };
}

function task(overrides: Partial<BrailleTask> = {}): BrailleTask {
  const base: BrailleTask = {
    id: "bt_stage5",
    organisationId: "org_stage5",
    title: "Water cycle response",
    subject: "Science",
    pupilId: "pupil_stage5",
    status: "teacher_review",
    createdBy: "u_ta",
    assignedTo: "u_teacher",
    uploadId: null,
    transcription: {
      transcriptionRunId: "trun_stage5_current",
      draftText: "The woter cycle.",
      editedText: "The water cycle.",
      finalText: "The water cycle.",
      status: "specialist_verified",
      confidence: 0,
      lowConfidenceRegions: [],
      engine: "controlled",
      specialistVerifiedBy: "u_qtvi",
      specialistVerifiedAt: at,
      specialistNotes: "Controlled fixture.",
      brailleAccuracyFindings: [],
      subjectTeacherReviewedBy: "u_teacher",
      subjectTeacherReviewedAt: at,
      reviewItems: [
        {
          id: "review-a", transcriptionRunId: "trun_stage5_current", start: 0, end: 5,
          machineText: "woter", reviewedText: "water", uncertaintyState: "review_required",
          reviewStatus: "corrected", category: "word", severity: "high", reason: "Fixture.",
          evidenceSource: "ocr_provider_flag", confidence: null, confidenceSource: null,
          alternativeText: null, reviewerNote: "", reviewedBy: "u_qtvi", reviewedAt: at,
        },
        {
          id: "review-b", transcriptionRunId: "trun_stage5_current", start: 6, end: 10,
          machineText: "cycle", reviewedText: "cycle", uncertaintyState: "review_suggested",
          reviewStatus: "confirmed", category: "word", severity: "low", reason: "Fixture.",
          evidenceSource: "ocr_provider_flag", confidence: null, confidenceSource: null,
          alternativeText: null, reviewerNote: "", reviewedBy: "u_qtvi", reviewedAt: at,
        },
        {
          id: "review-c", transcriptionRunId: "trun_stage5_current", start: 11, end: 15,
          machineText: "text", reviewedText: "text", uncertaintyState: "review_required",
          reviewStatus: "needs_rescan", category: "image_quality", severity: "high", reason: "Fixture.",
          evidenceSource: "ocr_provider_flag", confidence: null, confidenceSource: null,
          alternativeText: null, reviewerNote: "", reviewedBy: "u_qtvi", reviewedAt: at,
        },
        {
          id: "review-d", transcriptionRunId: "trun_stage5_current", start: 16, end: 20,
          machineText: "open", reviewedText: "open", uncertaintyState: "review_required",
          reviewStatus: "unreviewed", category: "word", severity: "medium", reason: "Fixture.",
          evidenceSource: "ocr_provider_flag", confidence: null, confidenceSource: null,
          alternativeText: null, reviewerNote: "", reviewedBy: null, reviewedAt: null,
        },
      ],
      provenance: {
        version: "1", availability: "partial", provider: "controlled-provider", model: "controlled-model",
        engineVersion: null, evidenceContract: null, pages: [], limitations: ["Controlled fixture."],
      },
      standardsEvaluations: [{
        standardFamily: "UEB", ruleId: "UEB-6.1.1", ruleVersion: "2024", ruleTitle: "Numeric mode",
        sourceReference: "https://iceb.org/", automatedOutcome: "insufficient_evidence", evaluatedAt: at,
        evidenceSummary: "Controlled fixture.", evidenceCellIds: [], implementationScope: "Controlled fixture.", limitations: [], overrides: [],
      }],
      specialistCorrectionEvidence: [
        correction("sce_current", "trun_stage5_current", "contraction"),
        correction("sce_previous", "trun_stage5_old", "punctuation"),
        correction("sce_legacy", null, "other"),
      ],
    },
    feedback: {
      summary: "Draft.", findings: { spelling: [], contractions: [], formatting: [], unclear: [] },
      specialistNotes: "Controlled fixture.", subjectFeedback: "", teacherComments: "", learnerSummary: "", reviewWarnings: [],
      approvedFinalComments: null, status: "teacher_review", approvedBy: null, approvedAt: null,
      teacherReviewedBy: "u_teacher", teacherReviewedAt: at, createdAt: at,
      subjectAssessment: {
        strengths: "Explains the cycle sequence.", misconceptions: "Evaporation needs fuller explanation.",
        completeness: "partially_complete", reasoning: "Teacher-authored controlled evidence.",
        assessedBy: "u_teacher", assessedAt: at,
      },
    },
    rejectionReason: null,
    exportedAt: null,
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: at,
  };
  return { ...base, ...overrides };
}

test("S5-1: review burden counts only actual persisted review items", () => {
  const summary = buildVerifiedEvidenceSummary(task());
  assert.deepEqual(summary.reviewBurden.flagged, { state: "recorded", value: 4 });
  assert.deepEqual(summary.reviewBurden.reviewed, { state: "recorded", value: 3 });
  assert.deepEqual(summary.reviewBurden.corrected, { state: "recorded", value: 1 });
  assert.deepEqual(summary.reviewBurden.confirmed, { state: "recorded", value: 1 });
  assert.deepEqual(summary.reviewBurden.needsRescan, { state: "recorded", value: 1 });
  assert.deepEqual(summary.reviewBurden.unresolved, { state: "recorded", value: 1 });
});

test("S5-2: missing review evidence is explicitly not recorded", () => {
  const controlled = task();
  controlled.transcription!.reviewItems = undefined;
  const summary = buildVerifiedEvidenceSummary(controlled);
  assert.deepEqual(summary.reviewBurden.flagged, { state: "not_recorded", value: null });
  assert.deepEqual(summary.reviewBurden.unresolved, { state: "not_recorded", value: null });
});

test("S5-3: the current Braivanta transcription run identity is retained", () => {
  const summary = buildVerifiedEvidenceSummary(task());
  assert.deepEqual(summary.transcriptionRun, { state: "recorded", id: "trun_stage5_current" });
});

test("S5-4: historical correction evidence is not counted as current-run evidence", () => {
  const summary = buildVerifiedEvidenceSummary(task());
  assert.deepEqual(summary.corrections.currentRun, { state: "recorded", value: 1 });
  assert.deepEqual(summary.corrections.previousRuns, { state: "recorded", value: 1 });
});

test("S5-5: current, historical, and legacy correction totals remain distinct", () => {
  const summary = buildVerifiedEvidenceSummary(task());
  assert.deepEqual(summary.corrections.legacyUnscoped, { state: "recorded", value: 1 });
  assert.deepEqual(summary.corrections.currentRunCategories, [{ category: "contraction", count: 1 }]);
  assert.deepEqual(summary.corrections.previousRunCategories, [{ category: "punctuation", count: 1 }]);
  assert.deepEqual(summary.corrections.legacyUnscopedCategories, [{ category: "other", count: 1 }]);
});

test("S5-6: specialist verification identity and time are retained accurately", () => {
  const summary = buildVerifiedEvidenceSummary(task());
  assert.deepEqual(summary.specialistVerification, { state: "recorded", verifiedBy: "u_qtvi", verifiedAt: at });
});

test("S5-7: teacher assessment is included only when actually recorded", () => {
  const summary = buildVerifiedEvidenceSummary(task());
  assert.equal(summary.teacherAssessment.state, "recorded");
  assert.equal(summary.teacherAssessment.value?.assessedBy, "u_teacher");
});

test("S5-8: standards decision support is bounded to actual Stage 3 records", () => {
  const summary = buildVerifiedEvidenceSummary(task());
  assert.deepEqual(summary.standardsDecisionSupport, { state: "recorded", value: 1 });
  const withoutStandards = task();
  withoutStandards.transcription!.standardsEvaluations = undefined;
  assert.deepEqual(buildVerifiedEvidenceSummary(withoutStandards).standardsDecisionSupport, { state: "not_recorded", value: null });
});

test("S5-9: verified learner submissions are ordered chronologically", () => {
  const later = task({ id: "bt_later", createdAt: "2026-08-03T09:00:00.000Z" });
  later.transcription!.specialistVerifiedAt = "2026-08-03T09:00:00.000Z";
  const earlier = task({ id: "bt_earlier", createdAt: "2026-08-01T09:00:00.000Z" });
  earlier.transcription!.specialistVerifiedAt = "2026-08-01T09:00:00.000Z";
  assert.deepEqual(buildLongitudinalEvidenceHistory([later, earlier], "pupil_stage5").map((entry) => entry.taskId), ["bt_earlier", "bt_later"]);
});

test("S5-10: another learner's task cannot leak into the record", () => {
  const other = task({ id: "bt_other", pupilId: "pupil_other" });
  assert.deepEqual(buildLongitudinalEvidenceHistory([task(), other], "pupil_stage5").map((entry) => entry.taskId), ["bt_stage5"]);
});

test("S5-11: the learner view model exposes only bounded evidence fields", () => {
  const entry = buildLongitudinalEvidenceHistory([task()], "pupil_stage5")[0];
  const encoded = JSON.stringify(entry);
  assert.equal(encoded.includes("The woter cycle."), false);
  assert.equal(encoded.includes("controlled-provider"), false);
  assert.equal(encoded.includes("machineText"), false);
  assert.equal(encoded.includes("reviewerReason"), false);
});

test("S5-12: teacher-authored assessment text remains unchanged", () => {
  const original = task().feedback!.subjectAssessment!;
  const entry = buildLongitudinalEvidenceHistory([task()], "pupil_stage5")[0];
  assert.deepEqual(entry.teacherAssessment.value, original);
});

test("S5-13: specialist categories remain descriptive evidence, not learner-fault conclusions", () => {
  const encoded = JSON.stringify(buildLongitudinalEvidenceHistory([task()], "pupil_stage5")[0].corrections);
  assert.equal(encoded.includes("learner_error"), false);
  assert.equal(encoded.includes("student_mistake"), false);
  assert.match(encoded, /contraction/);
});

test("S5-14: missing teacher assessment is not turned into negative learner evidence", () => {
  const controlled = task();
  controlled.feedback!.subjectAssessment = null;
  const entry = buildLongitudinalEvidenceHistory([controlled], "pupil_stage5")[0];
  assert.deepEqual(entry.teacherAssessment, { state: "not_recorded", value: null });
});

test("S5-15: legacy tasks without Stage 3 or Stage 4 fields remain valid", () => {
  const legacy = task();
  legacy.transcription!.transcriptionRunId = null;
  legacy.transcription!.reviewItems = undefined;
  legacy.transcription!.provenance = undefined;
  legacy.transcription!.standardsEvaluations = undefined;
  legacy.transcription!.specialistCorrectionEvidence = undefined;
  legacy.transcription!.specialistVerifiedAt = null;
  legacy.transcription!.specialistVerifiedBy = null;
  const summary = buildVerifiedEvidenceSummary(legacy);
  assert.equal(summary.transcriptionRun.state, "not_recorded");
  assert.equal(summary.provenance, "not_recorded");
  assert.equal(summary.corrections.state, "not_recorded");
  assert.equal(summary.specialistVerification.state, "not_recorded");
  assert.equal(summary.specialistVerification.verifiedAt, null);
});

test("S5-16: unverified submissions do not enter longitudinal evidence", () => {
  const unverified = task();
  unverified.transcription!.status = "needs_specialist_review";
  unverified.transcription!.finalText = null;
  assert.deepEqual(buildLongitudinalEvidenceHistory([unverified], "pupil_stage5"), []);
});

test("S5-17: RBAC grants bounded learner evidence access without broadening teaching-assistant access", () => {
  assert.equal(can("teaching_assistant", "pupil.evidence.read"), false);
  assert.equal(can("teacher", "pupil.evidence.read"), true);
  assert.equal(can("qtvi", "pupil.evidence.read"), true);
  assert.equal(can("senco", "pupil.evidence.read"), true);
  assert.equal(can("admin", "pupil.evidence.read"), true);
});

test("S5-18: summary contains no automated proficiency, grade, progress, or time-saving metric", () => {
  const summary = buildVerifiedEvidenceSummary(task()) as unknown as Record<string, unknown>;
  for (const forbidden of ["proficiency", "grade", "progress", "timeSaved", "efficiency"]) {
    assert.equal(forbidden in summary, false);
  }
});

test("S5-19: source evidence remains availability-only in the aggregation", () => {
  const summary = buildVerifiedEvidenceSummary(task());
  assert.equal(summary.provenance, "partial");
  assert.equal(JSON.stringify(summary).includes("pageId"), false);
  assert.equal(JSON.stringify(summary).includes("rawBraille"), false);
});

interface DurableRow { task: BrailleTask; upload: unknown; audit: unknown[]; corrections: unknown[]; }
function neonResponse(fields: string[], rows: unknown[][]): Response {
  return new Response(JSON.stringify({ fields: fields.map((name) => ({ name, dataTypeID: 25 })), rows, command: fields.length ? "SELECT" : "INSERT", rowCount: rows.length }), { status: 200, headers: { "content-type": "application/json" } });
}

test("S5-20: production persistence and hydration preserve evidence usable by Stage 5", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousFetch = neonConfig.fetchFunction;
  const dataDir = mkdtempSync(join(tmpdir(), "braivanta-stage5-durable-"));
  const rows = new Map<string, DurableRow>();
  process.env.DATABASE_URL = "postgresql://stage5:stage5@controlled.neon.test/braivanta";
  neonConfig.fetchFunction = async (_url: string, init: RequestInit) => {
    const request = JSON.parse(String(init.body)) as { query: string; params: unknown[] };
    const query = request.query.replace(/\s+/g, " ").trim();
    if (query.startsWith("CREATE TABLE")) return neonResponse([], []);
    if (query.startsWith("INSERT INTO insighted_braille_records")) {
      const [taskId, , taskJson, uploadJson, auditJson, correctionsJson] = request.params;
      rows.set(String(taskId), { task: JSON.parse(String(taskJson)), upload: uploadJson ? JSON.parse(String(uploadJson)) : null, audit: JSON.parse(String(auditJson)), corrections: JSON.parse(String(correctionsJson)) });
      return neonResponse([], []);
    }
    if (query.includes("FROM insighted_braille_records") && query.includes("WHERE task_id")) {
      const row = rows.get(String(request.params[0]));
      return neonResponse(["task", "upload", "audit", "corrections"], row ? [[JSON.stringify(row.task), row.upload ? JSON.stringify(row.upload) : null, JSON.stringify(row.audit), JSON.stringify(row.corrections)]] : []);
    }
    throw new Error(`Unexpected controlled Neon query: ${query}`);
  };
  try {
    const { db } = await import("../src/lib/store.ts");
    const { persistBrailleTask, hydrateBrailleTask } = await import("../src/lib/durable-braille.ts");
    const durable = task({ id: "bt_stage5_durable" });
    db.brailleTasks.unshift(durable);
    await persistBrailleTask(durable);
    db.brailleTasks = db.brailleTasks.filter((item) => item.id !== durable.id);
    const reloaded = await hydrateBrailleTask(durable.id);
    assert.equal(buildVerifiedEvidenceSummary(reloaded!).corrections.currentRun.value, 1);
    assert.equal(buildLongitudinalEvidenceHistory([reloaded!], "pupil_stage5")[0].teacherAssessment.value?.reasoning, "Teacher-authored controlled evidence.");
  } finally {
    neonConfig.fetchFunction = previousFetch;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("S5-21: legacy task with missing verification timestamp enters verified history with verifiedAt null", () => {
  const legacyVerified = task({ id: "bt_legacy_verified", createdAt: "2026-08-01T10:00:00.000Z" });
  legacyVerified.transcription!.status = "specialist_verified";
  legacyVerified.transcription!.finalText = "The water cycle.";
  legacyVerified.transcription!.specialistVerifiedAt = null;
  legacyVerified.transcription!.specialistVerifiedBy = null;

  const entries = buildLongitudinalEvidenceHistory([legacyVerified], "pupil_stage5");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].taskId, "bt_legacy_verified");
  assert.equal(entries[0].verifiedAt, null);
  assert.equal(entries[0].submittedAt, "2026-08-01T10:00:00.000Z");
  assert.notEqual(entries[0].verifiedAt, entries[0].submittedAt);
});

test("S5-22: chronological ordering remains deterministic when verified task has no verification timestamp", () => {
  const taskWithVerifiedDate = task({ id: "bt_verified_later", createdAt: "2026-08-01T08:00:00.000Z" });
  taskWithVerifiedDate.transcription!.specialistVerifiedAt = "2026-08-05T12:00:00.000Z";

  const taskWithoutVerifiedDate = task({ id: "bt_legacy_earlier", createdAt: "2026-08-02T08:00:00.000Z" });
  taskWithoutVerifiedDate.transcription!.specialistVerifiedAt = null;

  const history = buildLongitudinalEvidenceHistory([taskWithVerifiedDate, taskWithoutVerifiedDate], "pupil_stage5");
  assert.deepEqual(history.map((e) => e.taskId), ["bt_legacy_earlier", "bt_verified_later"]);
  assert.equal(history[0].verifiedAt, null);
  assert.equal(history[1].verifiedAt, "2026-08-05T12:00:00.000Z");
});

test("S5-23: learner evidence presentation explicitly represents unrecorded verification time", () => {
  const pageSource = readFileSync("src/app/(app)/pupils/[id]/evidence/page.tsx", "utf8");
  assert.equal(pageSource.includes("verified {new Date(entry.verifiedAt).toLocaleDateString("), false);
  assert.equal(pageSource.includes("verification time not recorded"), true);

  const evidenceLibSource = readFileSync("src/lib/stage5-evidence.ts", "utf8");
  assert.equal(evidenceLibSource.includes("specialistVerification.verifiedAt ?? summary.submittedAt"), false);
});

