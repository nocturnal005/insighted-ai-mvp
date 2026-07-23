/**
 * Optional live capability check for the model/API shape used by Assessment-Safe and STEM.
 * Uses the checked-in synthetic graph only; never send pupil material through this script.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadEnvConfig } = nextEnv;
loadEnvConfig(root);

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_VISION_MODEL || "gpt-5.4-mini";
if (!apiKey) {
  console.error("OPENAI_API_KEY is required for the live vision check.");
  process.exit(1);
}

const image = readFileSync(
  path.join(root, "demo-resources", "visuals", "sample-distance-time-graph.png"),
);
const imageUrl = `data:image/png;base64,${image.toString("base64")}`;
const client = new OpenAI({
  apiKey,
  timeout: Number(process.env.OPENAI_TIMEOUT_MS || 60000),
  maxRetries: 1,
});

const flagSchema = z
  .object({
    text: z.string(),
    reason: z.string(),
    category: z.string().nullable(),
    severity: z.string().nullable(),
  })
  .strict();

const visualSchema = z
  .object({
    visualType: z.string(),
    neutralDescription: z.string(),
    visibleElements: z.array(z.string()),
    labelsDetected: z.array(z.string()),
    spatialLayout: z.string(),
    confidence: z.number(),
    answerSensitiveFlags: z.array(flagSchema),
  })
  .strict();

const controls = model.startsWith("gpt-5")
  ? { reasoning_effort: "none" }
  : { temperature: 0, seed: 20260723 };

const completion = await client.chat.completions.parse({
  model,
  ...controls,
  max_completion_tokens: 2500,
  response_format: zodResponseFormat(
    visualSchema,
    "insighted_live_visual_check",
  ),
  messages: [
    {
      role: "system",
      content:
        "Inspect the supplied educational visual. Return a neutral accessibility description using the strict schema. Read visible text from the image itself.",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "This is a synthetic assessment fixture. Do not infer an answer. Report the visual type, visible labels, elements, and spatial layout.",
        },
        { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
      ],
    },
  ],
});

const parsed = completion.choices[0]?.message?.parsed;
if (!parsed) throw new Error("The model returned no parsed structured result.");

const evidence = [
  parsed.neutralDescription,
  parsed.spatialLayout,
  ...parsed.labelsDetected,
  ...parsed.visibleElements,
].join(" ");

if (!/distance[\s-]*time/i.test(evidence)) {
  throw new Error("The response did not identify the image's Distance-Time label.");
}
if (!/line|graph/i.test(`${parsed.visualType} ${evidence}`)) {
  throw new Error("The response did not identify the graph/line content.");
}
if (parsed.neutralDescription.trim().length < 40) {
  throw new Error("The image-derived description was unexpectedly short.");
}

console.log(
  JSON.stringify({
    ok: true,
    model,
    provider: "openai",
    structuredOutput: true,
    imageEvidence: true,
    visualType: parsed.visualType,
    labelCount: parsed.labelsDetected.length,
    requestId: completion._request_id ?? null,
  }),
);
