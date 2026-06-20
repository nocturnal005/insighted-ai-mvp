"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { db, id, recordAudit } from "@/lib/store";
import { simulateOcr } from "@/lib/braille-engine";
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
 * With the mock engine we use `simulateOcr(groundTruth)` so the numbers are believable
 * but clearly placeholder. When a real engine is wired, replace this line with
 * `await getBrailleEngine().transcribe({ imageUrl: sample.imageDataUrl })` — the scoring
 * and UI stay identical.
 */
export async function runEvaluation() {
  const user = requireUser();
  if (!can(user.role, "audit.read")) throw new Error("Not permitted");

  const now = new Date().toISOString();
  for (const sample of db.evalSamples) {
    const prediction = simulateOcr(sample.groundTruthText);
    const s = scorePair(prediction, sample.groundTruthText);
    sample.prediction = prediction;
    sample.cer = s.cer;
    sample.wer = s.wer;
    sample.lastRunAt = now;
  }
  recordAudit({ actorId: user.id, actorName: user.fullName, action: "eval.run", objectType: "Evaluation", objectLabel: `${db.evalSamples.length} sample(s)` });

  revalidatePath("/quality");
}

export async function deleteEvalSample(formData: FormData) {
  const user = requireUser();
  if (!can(user.role, "audit.read")) throw new Error("Not permitted");
  const sampleId = String(formData.get("sampleId"));
  db.evalSamples = db.evalSamples.filter((s) => s.id !== sampleId);
  revalidatePath("/quality");
}
