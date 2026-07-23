/**
 * Optional live end-to-end Braille check.
 *
 * Sends only the checked-in synthetic "hello world" Braille image through the configured
 * ABC primary -> Liblouis -> OpenAI discrepancy-review pipeline in an isolated demo store.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadEnvConfig } = nextEnv;
loadEnvConfig(root);

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required for the live hybrid Braille check.");
  process.exit(1);
}
if (
  process.env.LIBLOUIS_ENABLED !== "true" ||
  !process.env.LIBLOUIS_COMMAND ||
  !existsSync(process.env.LIBLOUIS_COMMAND)
) {
  console.error("Run npm run setup:liblouis and configure .env.local before this check.");
  process.exit(1);
}

const dataDir = mkdtempSync(path.join(os.tmpdir(), "insighted-braille-live-"));
const nextDistDir = `.next-validate-braille-live-${process.pid}`;
const nextTsConfig = `.tsconfig-validate-braille-live-${process.pid}.json`;
writeFileSync(
  path.join(root, nextTsConfig),
  `${JSON.stringify({ extends: "./tsconfig.json" }, null, 2)}\n`,
);
const port = 3996;
const base = `http://127.0.0.1:${port}`;
const model = process.env.OPENAI_VISION_MODEL || "gpt-5.4-mini";
const fixturePath = path.join(
  root,
  "demo-resources",
  "braille",
  "sample-braille-work.png",
);
const fixture = readFileSync(fixturePath);

function startApp() {
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "dev", "--webpack", "-p", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      AI_MODE: "real",
      AI_PROVIDER: "openai",
      OPENAI_VISION_MODEL: model,
      BRAILLE_OCR_PROVIDER: "abc_openai_review",
      ABC_BRAILLE_BASE_URL:
        process.env.ABC_BRAILLE_BASE_URL || "https://www.abcbraille.com",
      ABC_BRAILLE_TIMEOUT_MS: "60000",
      ABC_BRAILLE_DEBUG: "true",
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

function brailleActionIds() {
  for (const manifestPath of [
    path.join(root, nextDistDir, "dev", "server", "server-reference-manifest.json"),
    path.join(root, nextDistDir, "server", "server-reference-manifest.json"),
  ]) {
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const ids = {};
    for (const [actionId, entry] of Object.entries(manifest.node ?? {})) {
      if (
        String(entry.filename)
          .replaceAll("\\", "/")
          .endsWith("src/app/(app)/braille/actions.ts")
      ) {
        ids[entry.exportedName] = actionId;
      }
    }
    if (ids.runTranscription) return ids;
  }
  throw new Error("Braille action ids not found");
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

  async createTask() {
    const page = await (await this.get("/braille/new")).text();
    const actionId = extractFormActionId(page, 'name="title"');
    const form = new FormData();
    form.set(`$ACTION_ID_${actionId}`, "");
    form.set("title", "Live synthetic Braille check");
    form.set("subject", "English");
    form.set("pupilId", "");
    form.set(
      "image",
      new Blob([fixture], { type: "image/png" }),
      "synthetic-hello-world-braille.png",
    );
    const response = await fetch(`${base}/braille/new`, {
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
    if (response.status !== 303 || !location.includes("/braille/bt")) {
      throw new Error(`Braille task creation failed (${response.status})`);
    }
    return location;
  }

  async invoke(pathName, actionId, args) {
    return fetch(`${base}${pathName}`, {
      method: "POST",
      redirect: "manual",
      headers: this.headers({
        "Next-Action": actionId,
        "Content-Type": "text/plain;charset=UTF-8",
      }),
      body: JSON.stringify(args),
    });
  }
}

const app = startApp();
try {
  await waitForApp(app);
  const session = new Session();
  const taskPath = await session.createTask();
  const taskId = taskPath.split("/").pop();
  await (await session.get(taskPath)).text();
  const response = await session.invoke(
    taskPath,
    brailleActionIds().runTranscription,
    [taskId],
  );
  if (response.status !== 200) {
    throw new Error(`Run transcription failed (${response.status})`);
  }

  const stored = JSON.parse(readFileSync(path.join(dataDir, "db.json"), "utf8"));
  const task = stored.brailleTasks.find((candidate) => candidate.id === taskId);
  const transcription = task?.transcription;
  if (!transcription?.draftText?.trim()) {
    const flags = transcription?.aiFlags ?? [];
    throw new Error(
      `The primary Braille provider returned no draft: ${JSON.stringify(flags)}\n${app.validationOutput()}`,
    );
  }
  if (
    transcription.aiMode !== "real" ||
    transcription.aiProvider !== "abc_openai_review"
  ) {
    throw new Error(
      `Unexpected Braille route ${transcription.aiMode}/${transcription.aiProvider}`,
    );
  }
  if (!transcription.review) {
    throw new Error("Hybrid review evidence was not retained.");
  }
  if (
    transcription.aiFlags?.some((flag) => flag.category === "processing_failed")
  ) {
    throw new Error(
      `The hybrid result contains a processing failure: ${JSON.stringify(
        transcription.aiFlags,
      )}`,
    );
  }

  const page = await (await session.get(taskPath)).text();
  if (
    !page.includes("Live transcription") ||
    !page.includes("Hybrid review evidence") ||
    page.includes("Demo placeholder only")
  ) {
    throw new Error("The rendered Braille workflow did not expose the live hybrid result.");
  }

  console.log(
    JSON.stringify({
      ok: true,
      taskId,
      provider: transcription.aiProvider,
      model: transcription.aiModel,
      draftText: transcription.draftText,
      confidenceBasis: transcription.confidenceBasis,
      liblouisAvailable: transcription.review.backTranslationAvailable,
      reviewStatus: transcription.review.status,
      discrepancyCount: transcription.review.discrepancies.length,
      specialistReviewRequired: true,
    }),
  );
} finally {
  stopApp(app);
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(path.join(root, nextDistDir), { recursive: true, force: true });
  rmSync(path.join(root, nextTsConfig), { force: true });
}
