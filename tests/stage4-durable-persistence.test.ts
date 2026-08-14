import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { neonConfig } from "@neondatabase/serverless";
import type { BrailleTask, SpecialistCorrectionEvidence } from "../src/lib/types.ts";
import { reviewItemIdForRun } from "../src/lib/verification/confidence.ts";

interface DurableRow {
  task: BrailleTask;
  upload: unknown;
  audit: unknown[];
  corrections: unknown[];
}

function neonResponse(fields: string[], rows: unknown[][]): Response {
  return new Response(JSON.stringify({
    fields: fields.map((name) => ({ name, dataTypeID: 25 })),
    rows,
    command: fields.length ? "SELECT" : "INSERT",
    rowCount: rows.length,
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("S4-D1: production persistence/hydration preserves specialist correction then teacher assessment", async () => {
  const priorDatabaseUrl = process.env.DATABASE_URL;
  const priorDataDir = process.env.BRAIVANTA_DATA_DIR;
  const priorFetchFunction = neonConfig.fetchFunction;
  const dataDir = mkdtempSync(join(tmpdir(), "braivanta-stage4-durable-"));
  const rows = new Map<string, DurableRow>();

  process.env.DATABASE_URL = "postgresql://stage4:stage4@controlled.neon.test/braivanta";
  process.env.BRAIVANTA_DATA_DIR = dataDir;
  neonConfig.fetchFunction = async (_url: string, init: RequestInit) => {
    const request = JSON.parse(String(init.body)) as { query: string; params: unknown[] };
    const query = request.query.replace(/\s+/g, " ").trim();
    if (query.startsWith("CREATE TABLE")) return neonResponse([], []);
    if (query.startsWith("INSERT INTO insighted_braille_records")) {
      const [taskId, , taskJson, uploadJson, auditJson, correctionsJson] = request.params;
      rows.set(String(taskId), {
        task: JSON.parse(String(taskJson)) as BrailleTask,
        upload: uploadJson ? JSON.parse(String(uploadJson)) : null,
        audit: JSON.parse(String(auditJson)) as unknown[],
        corrections: JSON.parse(String(correctionsJson)) as unknown[],
      });
      return neonResponse([], []);
    }
    if (query.includes("FROM insighted_braille_records") && query.includes("WHERE task_id")) {
      const row = rows.get(String(request.params[0]));
      return neonResponse(["task", "upload", "audit", "corrections"], row ? [[
        JSON.stringify(row.task),
        row.upload ? JSON.stringify(row.upload) : null,
        JSON.stringify(row.audit),
        JSON.stringify(row.corrections),
      ]] : []);
    }
    throw new Error(`Unexpected controlled Neon query: ${query}`);
  };

  try {
    const { db } = await import("../src/lib/store.ts");
    const { persistBrailleTask, hydrateBrailleTask } = await import("../src/lib/durable-braille.ts");
    const { partitionCorrectionEvidence, planTeacherSubjectAssessment } = await import("../src/lib/dual-assessment.ts");
    const correction: SpecialistCorrectionEvidence = {
      id: "sce_stage4_durable",
      taskId: "bt_stage4_durable",
      transcriptionRunId: "trun_stage4_a",
      reviewItemId: reviewItemIdForRun("trun_stage4_a", 10, 15, 0),
      source: "flagged_passage",
      changeType: "text_replacement",
      machineText: "woter",
      previousText: "woter",
      reviewedText: "water",
      evidenceCategory: "word_interpretation",
      attribution: "unknown",
      reviewerId: "u_specialist",
      reviewedAt: "2026-08-13T14:00:00.000Z",
      reviewerReason: "Controlled specialist source check.",
      sourceEvidenceAvailability: "partial",
      relatedStandardRuleIds: [],
      uncertaintyState: "review_required",
    };
    const task: BrailleTask = {
      id: "bt_stage4_durable",
      organisationId: "org_stage4_controlled",
      title: "Controlled Stage 4 durable task",
      subject: "Science",
      pupilId: null,
      status: "teacher_review",
      createdBy: "u_specialist",
      assignedTo: "u_teacher",
      uploadId: null,
      transcription: {
        transcriptionRunId: "trun_stage4_a",
        draftText: "The woter cycle.",
        editedText: "The water cycle.",
        finalText: "The water cycle.",
        status: "specialist_verified",
        confidence: 0,
        lowConfidenceRegions: [],
        engine: "controlled",
        specialistVerifiedBy: "u_specialist",
        specialistVerifiedAt: "2026-08-13T14:01:00.000Z",
        specialistNotes: "Controlled fixture.",
        brailleAccuracyFindings: [],
        subjectTeacherReviewedBy: null,
        subjectTeacherReviewedAt: null,
        provenance: {
          version: "1",
          availability: "partial",
          provider: "controlled-provider",
          model: "controlled-model",
          engineVersion: null,
          evidenceContract: null,
          pages: [],
          limitations: ["Controlled fixture."],
        },
        standardsEvaluations: [{
          standardFamily: "UEB",
          ruleId: "UEB-6.1.1",
          ruleVersion: "2024",
          ruleTitle: "Numeric mode",
          sourceReference: "https://iceb.org/",
          automatedOutcome: "insufficient_evidence",
          evaluatedAt: "2026-08-13T14:00:00.000Z",
          evidenceSummary: "Controlled fixture.",
          evidenceCellIds: [],
          implementationScope: "Controlled fixture.",
          limitations: [],
          overrides: [],
        }],
        specialistCorrectionEvidence: [correction],
      },
      feedback: {
        summary: "Draft.",
        findings: { spelling: [], contractions: [], formatting: [], unclear: [] },
        specialistNotes: "Controlled fixture.",
        subjectFeedback: "",
        teacherComments: "",
        learnerSummary: "",
        reviewWarnings: [],
        approvedFinalComments: null,
        status: "teacher_review",
        approvedBy: null,
        approvedAt: null,
        teacherReviewedBy: null,
        teacherReviewedAt: null,
        createdAt: "2026-08-13T14:02:00.000Z",
        subjectAssessment: null,
      },
      rejectionReason: null,
      exportedAt: null,
      createdAt: "2026-08-13T14:00:00.000Z",
      updatedAt: "2026-08-13T14:02:00.000Z",
    };

    db.brailleTasks.unshift(task);
    await persistBrailleTask(task);
    db.brailleTasks = db.brailleTasks.filter((item) => item.id !== task.id);
    const correctionReload = await hydrateBrailleTask(task.id);
    assert.deepEqual(correctionReload?.transcription?.specialistCorrectionEvidence, [correction]);
    assert.equal(correctionReload?.transcription?.transcriptionRunId, "trun_stage4_a");

    const runB = "trun_stage4_b";
    const correctionB: SpecialistCorrectionEvidence = {
      ...correction,
      id: "sce_stage4_durable_b",
      transcriptionRunId: runB,
      reviewItemId: reviewItemIdForRun(runB, 10, 15, 0),
      machineText: "watur",
      previousText: "watur",
      reviewedText: "water",
      reviewerReason: "Controlled specialist check on the second transcription run.",
      reviewedAt: "2026-08-13T14:02:30.000Z",
    };
    correctionReload!.transcription!.transcriptionRunId = runB;
    correctionReload!.transcription!.draftText = "The watur cycle.";
    correctionReload!.transcription!.editedText = "The water cycle.";
    correctionReload!.transcription!.finalText = "The water cycle.";
    correctionReload!.transcription!.provenance = {
      ...correctionReload!.transcription!.provenance!,
      model: "controlled-model-b",
    };
    correctionReload!.transcription!.specialistCorrectionEvidence = [correction, correctionB];
    await persistBrailleTask(correctionReload!);
    db.brailleTasks = db.brailleTasks.filter((item) => item.id !== task.id);
    const rerunReload = await hydrateBrailleTask(task.id);
    assert.equal(rerunReload?.transcription?.transcriptionRunId, runB);
    assert.equal(rerunReload?.transcription?.specialistCorrectionEvidence?.[0].transcriptionRunId, "trun_stage4_a");
    assert.equal(rerunReload?.transcription?.specialistCorrectionEvidence?.[1].transcriptionRunId, runB);
    assert.notEqual(
      rerunReload?.transcription?.specialistCorrectionEvidence?.[0].reviewItemId,
      rerunReload?.transcription?.specialistCorrectionEvidence?.[1].reviewItemId,
    );
    const rerunEvidence = partitionCorrectionEvidence(
      rerunReload?.transcription?.specialistCorrectionEvidence,
      rerunReload?.transcription?.transcriptionRunId,
    );
    assert.deepEqual(rerunEvidence.current.map((entry) => entry.id), [correctionB.id]);
    assert.deepEqual(rerunEvidence.historical.map((entry) => entry.id), [correction.id]);
    assert.deepEqual(rerunEvidence.legacy, []);

    const protectedMachine = rerunReload!.transcription!.draftText;
    const protectedProvenance = structuredClone(rerunReload!.transcription!.provenance);
    const protectedStandards = structuredClone(rerunReload!.transcription!.standardsEvaluations);
    const protectedCorrections = structuredClone(rerunReload!.transcription!.specialistCorrectionEvidence);

    const assessmentPlan = planTeacherSubjectAssessment({
      task: rerunReload!,
      canAssess: true,
      teacherId: "u_teacher",
      assessedAt: "2026-08-13T14:03:00.000Z",
      input: {
        strengths: "Correctly identifies the water-cycle sequence.",
        misconceptions: "",
        completeness: "partially_complete",
        reasoning: "Evaporation needs a fuller explanation.",
      },
    });
    if (!assessmentPlan.ok) throw new Error(assessmentPlan.error);
    rerunReload!.feedback = assessmentPlan.feedback;
    rerunReload!.updatedAt = assessmentPlan.assessment.assessedAt;
    await persistBrailleTask(rerunReload!);
    db.brailleTasks = db.brailleTasks.filter((item) => item.id !== task.id);
    const assessmentReload = await hydrateBrailleTask(task.id);

    assert.deepEqual(assessmentReload?.feedback?.subjectAssessment, assessmentPlan.assessment);
    assert.equal(assessmentReload?.transcription?.draftText, protectedMachine);
    assert.deepEqual(assessmentReload?.transcription?.provenance, protectedProvenance);
    assert.deepEqual(assessmentReload?.transcription?.standardsEvaluations, protectedStandards);
    assert.deepEqual(assessmentReload?.transcription?.specialistCorrectionEvidence, protectedCorrections);
    const assessmentEvidence = partitionCorrectionEvidence(
      assessmentReload?.transcription?.specialistCorrectionEvidence,
      assessmentReload?.transcription?.transcriptionRunId,
    );
    assert.deepEqual(assessmentEvidence.current.map((entry) => entry.id), [correctionB.id]);
    assert.deepEqual(assessmentEvidence.historical.map((entry) => entry.id), [correction.id]);
  } finally {
    neonConfig.fetchFunction = priorFetchFunction;
    if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = priorDatabaseUrl;
    if (priorDataDir === undefined) delete process.env.BRAIVANTA_DATA_DIR;
    else process.env.BRAIVANTA_DATA_DIR = priorDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
