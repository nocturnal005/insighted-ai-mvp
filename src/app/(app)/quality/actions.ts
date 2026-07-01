"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { db, id, recordAudit } from "@/lib/store";
import { transcribeBraille, simulateOcrMock, summariseFlags, getAiConfig } from "@/lib/ai";
import { scorePair } from "@/lib/metrics";
import type { EvalSample } from "@/lib/types";

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
    } else {
      // No source image — use mock simulation and label it clearly.
      prediction = simulateOcrMock(sample.groundTruthText);
      provider = "mock";
      model = "mock-v1";
      confidence = null;
      aiMode = "mock";
      flagSummary = ["simulated: no source image — mock OCR used"];
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
  recordAudit({
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: "eval.run",
    objectType: "Evaluation",
    objectLabel: `${db.evalSamples.length} sample(s)`,
    aiMode: config.mode,
    provider: config.mode === "mock" ? "mock" : config.brailleOcrProvider,
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
