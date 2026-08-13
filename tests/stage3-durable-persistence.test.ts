import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { neonConfig } from "@neondatabase/serverless";
import type {
  BrailleTask,
  StandardsApplicability,
  TranscriptionProvenance,
} from "../src/lib/types.ts";

interface DurableRow {
  task: BrailleTask;
  upload: unknown;
  audit: unknown[];
  corrections: unknown[];
}

function neonResponse(fields: string[], rows: unknown[][]): Response {
  return new Response(
    JSON.stringify({
      fields: fields.map((name) => ({ name, dataTypeID: 25 })),
      rows,
      command: fields.length ? "SELECT" : "INSERT",
      rowCount: rows.length,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("D1: the durable Braille adapter preserves Stage 3 evidence and append-only decisions", async () => {
  const priorDatabaseUrl = process.env.DATABASE_URL;
  const priorDataDir = process.env.BRAIVANTA_DATA_DIR;
  const priorFetchFunction = neonConfig.fetchFunction;
  const dataDir = mkdtempSync(join(tmpdir(), "braivanta-stage3-durable-"));
  const rows = new Map<string, DurableRow>();

  process.env.DATABASE_URL = "postgresql://stage3:stage3@controlled.neon.test/braivanta";
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
      return neonResponse(
        ["task", "upload", "audit", "corrections"],
        row
          ? [[
              JSON.stringify(row.task),
              row.upload ? JSON.stringify(row.upload) : null,
              JSON.stringify(row.audit),
              JSON.stringify(row.corrections),
            ]]
          : [],
      );
    }
    throw new Error(`Unexpected controlled Neon query: ${query}`);
  };

  try {
    const { db } = await import("../src/lib/store.ts");
    const { persistBrailleTask, hydrateBrailleTask } = await import(
      "../src/lib/durable-braille.ts"
    );
    const { evaluateRegisteredStandards, planStandardsOverride } = await import(
      "../src/lib/standards/evaluation.ts"
    );

    const evaluatedAt = "2026-08-13T12:00:00.000Z";
    const provenance: TranscriptionProvenance = {
      version: "1",
      availability: "partial",
      provider: "abc_braille_web",
      model: "controlled-adapter",
      engineVersion: "controlled-v1",
      evidenceContract: null,
      pages: [{
        pageId: "braivanta-page-1",
        pageNumber: 1,
        dimensions: null,
        rawBraille: "⠼⠁",
        cells: [],
        mappings: [],
        mappingAvailability: "unavailable",
        sourceHighlightAvailability: "unavailable",
        limitations: ["Controlled durable integration fixture."],
      }],
      limitations: ["No cell-to-English mapping."],
    };
    const applicability: StandardsApplicability = {
      standardFamily: "UEB",
      basis: "configured_workflow",
      evidenceStatus: "supported",
      context: "Controlled Braivanta workflow explicitly configured for UEB.",
      source: "Controlled durable integration fixture",
      providerProof: "not_established",
      limitations: ["Application context is not provider proof."],
    };
    const evaluations = evaluateRegisteredStandards(provenance, applicability, evaluatedAt);
    const taskId = "bt_stage3_durable_controlled";
    const task: BrailleTask = {
      id: taskId,
      organisationId: "org_stage3_controlled",
      title: "Controlled Stage 3 durable persistence test",
      subject: "Mathematics",
      pupilId: null,
      status: "needs_specialist_review",
      createdBy: "u_stage3_test",
      assignedTo: "u_stage3_test",
      uploadId: null,
      transcription: {
        draftText: "1",
        editedText: "1",
        finalText: null,
        status: "needs_specialist_review",
        confidence: 0,
        lowConfidenceRegions: [],
        engine: "controlled-adapter",
        specialistVerifiedBy: null,
        specialistVerifiedAt: null,
        specialistNotes: "",
        brailleAccuracyFindings: [],
        subjectTeacherReviewedBy: null,
        subjectTeacherReviewedAt: null,
        provenance,
        standardsEvaluations: evaluations,
      },
      feedback: null,
      rejectionReason: null,
      exportedAt: null,
      createdAt: evaluatedAt,
      updatedAt: evaluatedAt,
    };

    db.brailleTasks.unshift(task);
    await persistBrailleTask(task);
    db.brailleTasks = db.brailleTasks.filter((item) => item.id !== taskId);

    const firstReload = await hydrateBrailleTask(taskId);
    assert.deepEqual(firstReload?.transcription?.provenance, provenance);
    assert.deepEqual(firstReload?.transcription?.standardsEvaluations, evaluations);

    const originalOutcome = firstReload?.transcription?.standardsEvaluations?.[0].automatedOutcome;
    const plan = planStandardsOverride({
      taskStatus: firstReload!.status,
      transcriptionStatus: firstReload!.transcription!.status,
      evaluations: firstReload!.transcription!.standardsEvaluations ?? [],
      ruleId: "UEB-6.1.1",
      decision: "confirm_interpretation",
      reviewerId: "u_stage3_specialist",
      reviewedAt: "2026-08-13T12:05:00.000Z",
      reason: "Controlled specialist decision persisted through the durable adapter.",
    });
    if (!plan.ok) throw new Error(plan.error);
    assert.equal(plan.ok, true);
    firstReload!.transcription!.standardsEvaluations = plan.evaluations;
    firstReload!.updatedAt = "2026-08-13T12:05:00.000Z";
    await persistBrailleTask(firstReload!);
    db.brailleTasks = db.brailleTasks.filter((item) => item.id !== taskId);

    const secondReload = await hydrateBrailleTask(taskId);
    const persistedEvaluation = secondReload?.transcription?.standardsEvaluations?.[0];
    assert.equal(persistedEvaluation?.automatedOutcome, originalOutcome);
    assert.equal(persistedEvaluation?.overrides.length, 1);
    assert.deepEqual(persistedEvaluation?.overrides[0], {
      decision: "confirm_interpretation",
      reviewerId: "u_stage3_specialist",
      reviewedAt: "2026-08-13T12:05:00.000Z",
      reason: "Controlled specialist decision persisted through the durable adapter.",
    });
  } finally {
    neonConfig.fetchFunction = priorFetchFunction;
    if (priorDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = priorDatabaseUrl;
    if (priorDataDir === undefined) delete process.env.BRAIVANTA_DATA_DIR;
    else process.env.BRAIVANTA_DATA_DIR = priorDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
