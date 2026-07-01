"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { db, id, recordAudit } from "@/lib/store";
import { transcribeBraille, simulateOcrMock, summariseFlags, toStoredFlags, getAiConfig } from "@/lib/ai";
import { assertValidUpload } from "@/lib/upload-guard";
import { scorePair } from "@/lib/metrics";
import type { EvalSample } from "@/lib/types";

type BrailleType = EvalSample["brailleType"];
type ImageQuality = EvalSample["imageQuality"];
type SampleSource = EvalSample["sampleSource"];
type PermissionStatus = EvalSample["permissionStatus"];

function pick<T extends string>(raw: FormDataEntryValue | null, allowed: readonly T[], fallback: T): T {
  const v = String(raw ?? "");
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Add a held-out ground-truth sample (image optional, correct transcription required). */
export async function addEvalSample(formData: FormData) {
  const user = requireUser();
  if (!can(user.role, "audit.read")) throw new Error("Not permitted");

  const label = String(formData.get("label") || "").trim();
  const groundTruthText = String(formData.get("groundTruthText") || "").trim();
  const file = formData.get("image") as File | null;
  if (!label || !groundTruthText) throw new Error("Label and ground-truth text are required");

  let imageDataUrl: string | null = null;
  if (file && file.size > 0) {
    assertValidUpload(file);
    const buf = Buffer.from(await file.arrayBuffer());
    imageDataUrl = `data:${file.type};base64,${buf.toString("base64")}`;
  }

  const sample: EvalSample = {
    id: id("eval"),
    label,
    groundTruthText,
    imageDataUrl,
    prediction: null,
    cer: null,
    wer: null,
    lastRunAt: null,
    createdByName: user.fullName,
    createdAt: new Date().toISOString(),
    subject: String(formData.get("subject") || "").trim() || null,
    yearGroup: String(formData.get("yearGroup") || "").trim() || null,
    brailleType: pick<NonNullable<BrailleType>>(formData.get("brailleType"), ["ueb_grade_1", "ueb_grade_2", "unknown"], "unknown"),
    imageQuality: pick<NonNullable<ImageQuality>>(formData.get("imageQuality"), ["good", "medium", "poor", "unknown"], "unknown"),
    sampleSource: pick<NonNullable<SampleSource>>(formData.get("sampleSource"), ["synthetic", "anonymised_school_sample", "other"], "synthetic"),
    permissionStatus: pick<NonNullable<PermissionStatus>>(formData.get("permissionStatus"), ["synthetic", "anonymised_only", "approved_for_testing", "not_approved"], "synthetic"),
  };
  db.evalSamples.unshift(sample);
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "eval.sample", objectType: "Eval sample", objectLabel: label });

  redirect("/quality");
}

/**
 * Runs the current engine against every ground-truth sample and scores it (CER/WER).
 *
 * Samples WITH an image are sent through the real AI/OCR service (`transcribeBraille`),
 * which respects `AI_MODE` and the configured Braille provider. Samples WITHOUT an image
 * fall back to deterministic mock simulation and are explicitly labelled `mock`, so the
 * numbers are never mistaken for a real OCR measurement.
 */
export async function runEvaluation() {
  const user = requireUser();
  if (!can(user.role, "audit.read")) throw new Error("Not permitted");

  const now = new Date().toISOString();
  let promptVersion: string | null = null;
  const aggregateFlags: string[] = [];
  for (const sample of db.evalSamples) {
    let prediction: string;
    let provider: string;
    let model: string;
    let confidence: number | null;
    let aiMode: "mock" | "real";
    let flagSummary: string[];

    if (sample.imageDataUrl) {
      const r = await transcribeBraille({
        taskId: sample.id,
        title: sample.label,
        mimeType: sample.imageDataUrl.startsWith("data:") ? sample.imageDataUrl.slice(5).split(/[;,]/)[0] : undefined,
        dataUrl: sample.imageDataUrl,
      });
      prediction = r.draftText;
      provider = r.meta.provider;
      model = r.meta.model;
      confidence = r.confidence;
      aiMode = r.meta.mode;
      flagSummary = summariseFlags(r.flags);
      promptVersion = r.meta.promptVersion;
      sample.aiFlags = toStoredFlags(r.flags);
      aggregateFlags.push(...flagSummary);
    } else {
      // No source image — use mock simulation and label it clearly.
      prediction = simulateOcrMock(sample.groundTruthText);
      provider = "mock";
      model = "mock-v1";
      confidence = null;
      aiMode = "mock";
      flagSummary = ["simulated: no source image — mock OCR used"];
      sample.aiFlags = null;
    }

    const s = scorePair(prediction, sample.groundTruthText);
    sample.prediction = prediction;
    sample.cer = s.cer;
    sample.wer = s.wer;
    sample.lastRunAt = now;
    sample.provider = provider;
    sample.model = model;
    sample.confidence = confidence;
    sample.aiMode = aiMode;
    sample.flagSummary = flagSummary;
  }

  const config = getAiConfig();
  // De-duplicate the aggregate flag summary for a concise, secret-free audit record.
  const flagSummary = Array.from(new Set(aggregateFlags)).slice(0, 8);
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "eval.run",
    objectType: "Evaluation",
    objectLabel: `${db.evalSamples.length} sample(s)`,
    aiMode: config.mode,
    provider: config.mode === "mock" ? "mock" : config.brailleOcrProvider,
    promptVersion,
    flagSummary: flagSummary.length ? flagSummary : null,
  });

  revalidatePath("/quality");
}

export async function deleteEvalSample(formData: FormData) {
  const user = requireUser();
  if (!can(user.role, "audit.read")) throw new Error("Not permitted");
  const sampleId = String(formData.get("sampleId"));
  const removed = db.evalSamples.find((s) => s.id === sampleId);
  db.evalSamples = db.evalSamples.filter((s) => s.id !== sampleId);
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "eval.sample.delete",
    objectType: "Eval sample",
    objectLabel: removed?.label ?? sampleId,
  });
  revalidatePath("/quality");
}
