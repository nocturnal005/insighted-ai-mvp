/**
 * Optional live end-to-end validation for Assessment-Safe and STEM.
 *
 * Boots an isolated Next.js demo, submits the checked-in synthetic graph through the
 * real Server Actions, and verifies that GPT-5.4 mini produced image-derived records.
 * No pupil is linked and the temporary task store is deleted afterwards.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadEnvConfig } = nextEnv;
loadEnvConfig(root);

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required for the live workflow check.");
  process.exit(1);
}

const dataDir = mkdtempSync(path.join(os.tmpdir(), "insighted-vision-live-"));
const nextDistDir = `.next-validate-vision-${process.pid}`;
const nextTsConfig = `.tsconfig-validate-vision-${process.pid}.json`;
writeFileSync(
  path.join(root, nextTsConfig),
  `${JSON.stringify({ extends: "./tsconfig.json" }, null, 2)}\n`,
);
const port = 3995;
const base = `http://127.0.0.1:${port}`;
const model = process.env.OPENAI_VISION_MODEL || "gpt-5.4-mini";
const fixture = readFileSync(
  path.join(root, "demo-resources", "visuals", "sample-distance-time-graph.png"),
);

function startApp() {
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "-p", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      AI_MODE: "real",
      AI_PROVIDER: "openai",
      OPENAI_VISION_MODEL: model,
      DEMO_MODE: "true",
      ALLOW_REAL_PUPIL_DATA: "false",
      DATABASE_URL: "",
      POSTGRES_URL: "",
      NEON_DATABASE_URL: "",
      INSIGHTED_DATA_DIR: dataDir,
      INSIGHTED_NEXT_DIST_DIR: nextDistDir,
      INSIGHTED_TSCONFIG_PATH: nextTsConfig,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  const collect = (chunk) => {
    output = `${output}${chunk.toString("utf8")}`.slice(-8000);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.validationOutput = () => output;
  return child;
}

function stopApp(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
}

async function waitForApp(child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `app exited before becoming ready (code ${child.exitCode})\n${child.validationOutput()}`,
      );
    }
    try {
      if ((await fetch(`${base}/login`)).status === 200) return;
    } catch {
      // Still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`app did not become ready\n${child.validationOutput()}`);
}

function extractFormActionId(html, marker) {
  for (const match of html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)) {
    if (!match[0].includes(marker)) continue;
    const id = match[0].match(/name="\$ACTION_ID_([a-f0-9]+)"/);
    if (id) return id[1];
  }
  throw new Error(`no form containing ${marker}`);
}

class Session {
  cookie = "insighted_session=u_amelia";

  headers(extra = {}) {
    return { Origin: base, Cookie: this.cookie, ...extra };
  }

  async get(pathName) {
    return fetch(`${base}${pathName}`, {
      redirect: "manual",
      headers: this.headers(),
    });
  }

  async create(pathName, fields) {
    const page = await (await this.get(pathName)).text();
    const actionId = extractFormActionId(page, 'name="title"');
    const form = new FormData();
    form.set(`$ACTION_ID_${actionId}`, "");
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    form.set(
      "image",
      new Blob([fixture], { type: "image/png" }),
      "sample-distance-time-graph.png",
    );

    const response = await fetch(`${base}${pathName}`, {
      method: "POST",
      redirect: "manual",
      headers: this.headers(),
      body: form,
    });
    const location = (
      response.headers.get("x-action-redirect") ||
      response.headers.get("location") ||
      ""
    ).split("?")[0];
    if (response.status !== 303 || !location) {
      const body = await response.text();
      throw new Error(
        `${pathName} creation failed (${response.status}) ${body.slice(0, 1000)}`,
      );
    }
    return location;
  }
}

function assertRealImageResult(task, label) {
  if (!task) throw new Error(`${label} task was not persisted`);
  if (task.aiMode !== "real" || task.aiProvider !== "openai") {
    throw new Error(
      `${label} did not use live OpenAI (${task.aiMode}/${task.aiProvider})`,
    );
  }
  if (task.aiModel !== model) {
    throw new Error(`${label} used ${task.aiModel || "no model"}, expected ${model}`);
  }
  if (!task.draftDescription || task.draftDescription.length < 40) {
    throw new Error(`${label} returned no meaningful description`);
  }
  if (!/line graph|green straight line|rectangular border/i.test(task.draftDescription)) {
    throw new Error(
      `${label} description did not contain expected image evidence: ${JSON.stringify(
        task.draftDescription.slice(0, 500),
      )}`,
    );
  }
  if (
    task.draftDescription.includes("No AI description was produced") ||
    task.aiFlags?.some((flag) =>
      ["provider_unavailable", "processing_failed"].includes(flag.category),
    )
  ) {
    throw new Error(`${label} stored a controlled failure rather than a live result`);
  }
}

const app = startApp();
try {
  await waitForApp(app);
  const session = new Session();
  const assessmentPath = await session.create("/assessment/new", {
    title: "Live assessment vision check",
    subject: "Physics",
    yearGroup: "Year 11",
    context: "assessment",
    questionPrompt:
      "Describe the graph structure without stating or interpreting the trend.",
    assessedSkill: "Identify graph components and read visible labels.",
    pupilId: "",
  });
  const stemPath = await session.create("/stem/new", {
    title: "Live STEM vision check",
    subject: "Physics",
    yearGroup: "Year 11",
    visualType: "line_graph",
    style: "descriptive",
    pupilId: "",
  });

  const stored = JSON.parse(readFileSync(path.join(dataDir, "db.json"), "utf8"));
  const assessmentId = assessmentPath.split("/").pop();
  const stemId = stemPath.split("/").pop();
  const assessment = stored.visualTasks.find((task) => task.id === assessmentId);
  const stem = stored.stemTasks.find((task) => task.id === stemId);
  assertRealImageResult(assessment, "Assessment-Safe");
  assertRealImageResult(stem, "STEM");
  if (
    /\b(slant(?:s|ed|ing)?|slope|rise[sn]?|fall(?:s|ing)?|increas(?:e|es|ed|ing)|decreas(?:e|es|ed|ing)|upward|downward|upper left|lower right)\b/i.test(
      assessment.draftDescription,
    )
  ) {
    throw new Error(
      `Assessment-Safe learner text leaked the plotted relationship: ${JSON.stringify(
        assessment.draftDescription,
      )}`,
    );
  }

  for (const task of [assessment, stem]) {
    const upload = stored.uploads.find((item) => item.taskId === task.id);
    if (!upload) throw new Error(`${task.title} did not retain its source upload`);
    const audit = stored.audit.find(
      (entry) => entry.taskId === task.id && entry.action.startsWith("ai."),
    );
    if (!audit || audit.aiMode !== "real" || audit.model !== model) {
      throw new Error(`${task.title} did not retain live AI audit provenance`);
    }
  }

  const assessmentPage = await (await session.get(assessmentPath)).text();
  const stemPage = await (await session.get(stemPath)).text();
  if (
    !assessmentPage.includes("Real provider") ||
    !stemPage.includes("Real provider") ||
    assessmentPage.includes("Mock demo") ||
    stemPage.includes("Mock demo")
  ) {
    throw new Error("Rendered workflow pages did not expose live-result provenance");
  }

  console.log(
    JSON.stringify({
      ok: true,
      model,
      assessment: {
        taskId: assessmentId,
        confidence: assessment.confidence,
        descriptionLength: assessment.draftDescription.length,
      },
      stem: {
        taskId: stemId,
        confidence: stem.confidence,
        descriptionLength: stem.draftDescription.length,
      },
      sourceUploads: true,
      auditProvenance: true,
    }),
  );
} finally {
  stopApp(app);
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(path.join(root, nextDistDir), { recursive: true, force: true });
  rmSync(path.join(root, nextTsConfig), { force: true });
}
