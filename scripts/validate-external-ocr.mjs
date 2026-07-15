/**
 * External Braille OCR integration guardrails (Stage 3D-C).
 *
 * Behavioural validation of the InsightEd AI <-> external_braille_ocr contract and the
 * human-verification workflow, WITHOUT the real OCR engine: the script runs a local mock
 * engine endpoint, boots the app against it, and drives the real server actions with
 * role-scoped sessions.
 *
 * Covers:
 *   A. Adapter contract — request fields, `Authorization: Bearer` key, response
 *      acceptance, confidence clamping, flag preservation, raw-body non-storage,
 *      controlled provider failure.
 *   C. Workflow gates — draft-only start, Needs specialist review, teacher cannot
 *      specialist-verify, TA cannot approve feedback, QTVI verifies, feedback only
 *      after verification, export blocked before approval and open after, audit
 *      completeness + hygiene.
 *   D. OCR Quality — the draft→final correction pair (CER/WER + engine metadata)
 *      appears after specialist verification.
 *
 * Run:  npm run validate:external-ocr
 * Requires: no other `next dev` running in this project directory (the script boots its
 * own instance on port 3993 and a mock engine on 8991). The real OCR engine is NOT
 * required. Synthetic image only — never use real pupil data in validation.
 */
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Isolated throwaway store so validation never touches the local demo data.
const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "insighted-guardrail-"));
const APP_PORT = 3993;
const MOCK_PORT = 8991;
const BASE = `http://127.0.0.1:${APP_PORT}`;
const MOCK_ENDPOINT = `http://127.0.0.1:${MOCK_PORT}/ocr`;
const CONTRACT_KEY = "test-contract-key"; // local throwaway value, never a real secret

const MOCK_DRAFT = "mock draft transcription line 9f3e";
const MOCK_FLAG_REASON = "MOCK-FLAG-REASON-7b21 synthetic uncertainty for guardrail";
const RAW_BODY_MARKER = "RAW-PROVIDER-BODY-MARKER-9c4e";
const VERIFIED_FINAL = `${MOCK_DRAFT} corrected by specialist`;
const TEACHER_COMMENTS = "Guardrail teacher feedback comments 51ad.";

const DRAFT_WARNING =
  "This draft transcription must be checked by a QTVI or Braille-literate specialist before teacher feedback or export.";
const MANUAL_TRANSCRIPTION_WARNING =
  "OCR did not produce a dependable starting point from this capture.";
const GATE_HINT = "Teacher feedback &amp; export unlock after specialist verification";

// 106x64 synthetic Braille PNG (generated test asset — not pupil work).
const SYNTHETIC_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAaoAAACACAAAAAB/pHLOAAAB/0lEQVR4nO3asW6DMBRA0bjq//8yHaouTQbcuIQbzlk6gNBDVzjFYmw3Gj5ePQB7SZUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVcbn5PnjdtvOd3S/++scM/OC+cfUBcb3n+1cR/e7v84xMy+Z3wKYMZVq/Pp7jqP73V/nmJnXzO+pypDqPVP9/Cxupzq63/11jpl5zfyeqoy5f9a9V2Xeq3ghC2CGVJfYA5zdH1u1yzcm1/1VM8/e0d/O/Ic9wNn9sVW7fGP3mWtnnr2jZ2Z+yAL4/nuAs/tjq3b5xu4z1848e0fPzPyYpypDqvffA5zdH1u1y7ftPnPtzLN39MzMj3mqLrEH6L1qnPe9iheyAGZI9bZ7gM+42neAix33W3W17wCXswBmHJbqat8BruepypAq47BUV/sOcD1PVcaRG0tneIMZ3qv4dxbADKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKluFV8ot6Xzb1ofUQAAAABJRU5ErkJggg==";

const failures = [];
let checks = 0;

function check(name, ok, detail = "") {
  checks += 1;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

// ── Mock external Braille OCR engine ────────────────────────────────────────
const mockRequests = [];

function startMockEngine() {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let parsed = null;
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        parsed = { unparseable: true };
      }
      mockRequests.push({ headers: req.headers, body: parsed });

      if ((parsed.title ?? "").includes("PROVIDER-FAIL")) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "simulated engine failure" }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          draftText: MOCK_DRAFT,
          confidence: 1.4, // deliberately out of range: the adapter must clamp to [0,1]
          rawBraille: "⠍⠕⠉⠅",
          rawCells: [{ line: 1, cellIndex: 1, dots: [1, 3, 4], bbox: [10, 10, 30, 40], confidence: 0.9 }],
          providerRequestId: "mock_req_guardrail_001",
          flags: [{ text: "", reason: MOCK_FLAG_REASON, category: "low_ocr_confidence", severity: "low" }],
          pageResults: [{ pageNumber: 1, text: MOCK_DRAFT, confidence: 0.9, flags: [] }],
          // Extra field a real engine might send. It must never be stored or surfaced:
          secretRawMarker: RAW_BODY_MARKER,
        }),
      );
    });
  });
  return new Promise((resolve) => server.listen(MOCK_PORT, "127.0.0.1", () => resolve(server)));
}

// ── App instance ─────────────────────────────────────────────────────────────
function startApp() {
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(APP_PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      AI_MODE: "real",
      AI_PROVIDER: "mock",
      BRAILLE_OCR_PROVIDER: "external_braille_ocr",
      BRAILLE_OCR_ENDPOINT: MOCK_ENDPOINT,
      BRAILLE_OCR_API_KEY: CONTRACT_KEY,
      BRAILLE_OCR_TIMEOUT_MS: "10000",
      DEMO_MODE: "true",
      ALLOW_REAL_PUPIL_DATA: "", // never needed: guardrail tasks are not pupil-linked
      INSIGHTED_DATA_DIR: DATA_DIR, // isolated throwaway store (never the demo data)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}

function stopApp(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

async function waitForApp(timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/login`, { redirect: "manual" });
      if (r.status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`app did not become ready on ${BASE}`);
}

// ── Role-scoped HTTP sessions (real server actions, real cookies) ───────────
function extractFormActionId(html, marker) {
  for (const match of html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)) {
    if (match[0].includes(marker)) {
      const id = match[0].match(/name="\$ACTION_ID_([a-f0-9]+)"/);
      if (id) return id[1];
    }
  }
  throw new Error(`no form containing ${marker}`);
}

class Session {
  constructor() {
    this.cookie = "";
  }

  headers(extra = {}) {
    return { Origin: BASE, ...(this.cookie ? { Cookie: this.cookie } : {}), ...extra };
  }

  async get(pathName) {
    return fetch(`${BASE}${pathName}`, { redirect: "manual", headers: this.headers() });
  }

  async login(userId) {
    const page = await (await this.get("/login")).text();
    const actionId = extractFormActionId(page, `value="${userId}"`);
    const form = new FormData();
    form.set(`$ACTION_ID_${actionId}`, "");
    form.set("userId", userId);
    const r = await fetch(`${BASE}/login`, {
      method: "POST",
      redirect: "manual",
      headers: this.headers(),
      body: form,
    });
    const setCookie = r.headers.getSetCookie?.() ?? [r.headers.get("set-cookie")].filter(Boolean);
    const session = setCookie.map((c) => c.split(";")[0]).find((c) => c.startsWith("insighted_session="));
    if (r.status !== 303 || !session) throw new Error(`login failed for ${userId} (${r.status})`);
    this.cookie = session;
    return this;
  }

  async createTask(title) {
    const page = await (await this.get("/braille/new")).text();
    const actionId = extractFormActionId(page, 'name="title"');
    const form = new FormData();
    form.set(`$ACTION_ID_${actionId}`, "");
    form.set("title", title);
    form.set("subject", "English");
    form.set("pupilId", ""); // No pupil linked — keeps the pupil-data safety gate untouched
    form.set(
      "image",
      new Blob([Buffer.from(SYNTHETIC_PNG_B64, "base64")], { type: "image/png" }),
      "synthetic-braille-guardrail.png",
    );
    const r = await fetch(`${BASE}/braille/new`, {
      method: "POST",
      redirect: "manual",
      headers: this.headers(),
      body: form,
    });
    const location = (r.headers.get("x-action-redirect") || r.headers.get("location") || "").split("?")[0];
    if (![302, 303].includes(r.status) || !location.includes("/braille/bt")) {
      throw new Error(`task creation failed (${r.status} -> ${location})`);
    }
    return location;
  }

  async invoke(pagePath, actionId, args) {
    return fetch(`${BASE}${pagePath}`, {
      method: "POST",
      redirect: "manual",
      headers: this.headers({ "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8" }),
      body: JSON.stringify(args),
    });
  }

  async export(taskId, kind) {
    return this.get(`/api/export/${taskId}?kind=${kind}`);
  }
}

/** Braille server-action ids from the dev-compiled module (name -> id). */
function brailleActionIds() {
  const compiled = readFileSync(path.join(ROOT, ".next", "server", "app", "(app)", "braille", "new", "page.js"), "utf8");
  for (const match of compiled.matchAll(/__next_internal_action_entry_do_not_use__ \{([^}]+)\}/g)) {
    if (match[1].includes("runTranscription")) {
      const ids = {};
      for (const pair of match[1].matchAll(/\\?"([a-f0-9]{40})\\?":\\?"(\w+)\\?"/g)) ids[pair[2]] = pair[1];
      return ids;
    }
  }
  throw new Error("braille action ids not found (route not compiled?)");
}

// ── Validation flow ──────────────────────────────────────────────────────────
async function main() {
  console.log("External Braille OCR guardrails: mock engine + app instance (no real engine needed)");

  const mock = await startMockEngine();
  const app = startApp();
  let exitCode = 1;

  try {
    process.stdout.write("booting app instance (first compile can take a minute)... ");
    await waitForApp();
    console.log("ready");

    const ta = await new Session().login("u_amelia");
    const teacher = await new Session().login("u_david");
    const qtvi = await new Session().login("u_priya");
    const senco = await new Session().login("u_helen");

    // ---- A. Adapter contract -------------------------------------------------
    section("A. external_braille_ocr adapter contract");
    const taskPath = await ta.createTask("Guardrail contract validation task");
    const taskId = taskPath.split("/").pop();
    check("task created with synthetic image, no pupil linked", true, taskPath);

    const ids = brailleActionIds();
    const runResponse = await ta.invoke(taskPath, ids.runTranscription, [taskId]);
    check("runTranscription dispatched", runResponse.status === 200, `status=${runResponse.status}`);

    const engineRequest = mockRequests.at(-1);
    check("adapter called the configured endpoint", Boolean(engineRequest));
    if (engineRequest) {
      const requestBody = engineRequest.body;
      for (const field of ["taskId", "title", "fileName", "mimeType", "dataUrl", "subject", "yearGroup"]) {
        check(`request includes ${field}`, field in requestBody);
      }
      check("request taskId matches task", requestBody.taskId === taskId);
      check("request dataUrl is an image data URL", String(requestBody.dataUrl).startsWith("data:image/"));
      check(
        "API key sent as Authorization: Bearer",
        engineRequest.headers.authorization === `Bearer ${CONTRACT_KEY}`,
      );
    }

    let page = await (await ta.get(taskPath)).text();
    check("engine draftText accepted and shown", page.includes(MOCK_DRAFT));
    check("result is draft-only (warning shown)", page.includes(DRAFT_WARNING));
    check("status: Needs specialist review", page.includes("Needs specialist review"));
    check("engine uncertainty flag preserved", page.includes("MOCK-FLAG-REASON-7b21"));
    check("raw provider body not stored (task page)", !page.includes(RAW_BODY_MARKER));

    const auditHtml = await (await senco.get("/audit")).text();
    const auditEntry = auditHtml.slice(
      Math.max(0, auditHtml.indexOf("Guardrail contract validation task") - 400),
      auditHtml.indexOf("Guardrail contract validation task") + 1200,
    );
    check(
      "confidence clamped to [0,1] (engine sent 1.4, audit shows 100%)",
      auditEntry.includes("100%") && !auditHtml.includes("140%"),
    );
    check("raw provider body not stored (audit)", !auditHtml.includes(RAW_BODY_MARKER));

    // ---- C. Human workflow gates ----------------------------------------------
    section("C. Human-verification workflow gates");

    let r = await teacher.invoke(taskPath, ids.createFeedback, [taskId]);
    page = await (await teacher.get(taskPath)).text();
    check("feedback blocked before specialist verification", !page.includes("AI draft · editable"));

    r = await teacher.invoke(taskPath, ids.verifyTranscription, [taskId, "tampered by teacher", ""]);
    page = await (await teacher.get(taskPath)).text();
    check(
      "teacher cannot specialist-verify (state unchanged)",
      page.includes("Needs specialist review") && !page.includes("Verified and locked"),
    );
    check("teacher tampering not persisted", !page.includes("tampered by teacher"));

    r = await teacher.export(taskId, "transcription");
    check("transcription export blocked pre-verification (409)", r.status === 409, `status=${r.status}`);
    r = await ta.export(taskId, "transcription");
    check("TA export blocked by role (403)", r.status === 403, `status=${r.status}`);

    r = await qtvi.invoke(taskPath, ids.verifyTranscription, [
      taskId,
      VERIFIED_FINAL,
      "Guardrail specialist notes: checked against source Braille.",
    ]);
    page = await (await qtvi.get(taskPath)).text();
    check("QTVI can specialist-verify", page.includes("Verified and locked"), `status=${r.status}`);
    check("status: Specialist verified", page.includes("Specialist verified"));

    r = await teacher.export(taskId, "feedback");
    check("feedback export blocked pre-approval (409)", r.status === 409, `status=${r.status}`);

    r = await teacher.invoke(taskPath, ids.createFeedback, [taskId]);
    page = await (await teacher.get(taskPath)).text();
    check("teacher feedback opens after verification", page.includes("AI draft"), `status=${r.status}`);

    await teacher.invoke(taskPath, ids.saveFeedback, [taskId, TEACHER_COMMENTS, "Learner summary 51ad."]);

    r = await ta.invoke(taskPath, ids.approveFeedback, [taskId]);
    page = await (await teacher.get(taskPath)).text();
    check("TA cannot approve teacher feedback", !page.includes("Staff-approved"));

    r = await teacher.invoke(taskPath, ids.approveFeedback, [taskId]);
    page = await (await teacher.get(taskPath)).text();
    check("teacher can approve feedback", page.includes("Staff-approved"), `status=${r.status}`);

    r = await teacher.export(taskId, "feedback");
    const exportBody = await r.text();
    check("feedback export allowed post-approval (200)", r.status === 200, `status=${r.status}`);
    check("export contains approved feedback", exportBody.includes(TEACHER_COMMENTS));
    check("export has no raw provider body", !exportBody.includes(RAW_BODY_MARKER));
    check("export has no base64 image data", !exportBody.includes("iVBORw0KGgo"));

    // ---- Audit completeness + hygiene -----------------------------------------
    const finalAudit = await (await senco.get("/audit")).text();
    for (const [label, needle] of [
      ["task created", "created a task"],
      ["upload created", "uploaded a file"],
      ["AI/OCR run", "ran AI/OCR Braille draft on"],
      ["specialist verification", "specialist verified"],
      ["feedback generated", "generated feedback for"],
      ["feedback approved", "approved feedback for"],
      ["export completed", "exported"],
    ]) {
      check(`audit records: ${label}`, finalAudit.includes(needle));
    }
    check("audit has no base64 image data", !finalAudit.includes("iVBORw0KGgo"));
    check("audit has no API key", !finalAudit.includes(CONTRACT_KEY));
    check("audit has no raw provider payload", !finalAudit.includes(RAW_BODY_MARKER));
    const taRedirect = await ta.get("/audit");
    check(
      "TA blocked from audit",
      [302, 303, 307].includes(taRedirect.status) &&
        (taRedirect.headers.get("location") || "").includes("/dashboard"),
    );

    // ---- D. OCR Quality correction pair ----------------------------------------
    section("D. OCR Quality captures the draft→final correction pair");
    const quality = await (await qtvi.get("/quality")).text();
    check("quality page reachable for QTVI", quality.includes("Captured corrections"));
    check("correction pair captured for the task", quality.includes("Guardrail contract validation task"));
    check("engine metadata preserved", quality.includes("external"));
    check("no raw provider body in quality data", !quality.includes(RAW_BODY_MARKER));
    // CER/WER are computed by scorePair at capture; draft differs from final, so a
    // non-zero CER percentage must render alongside the pair.
    check("CER/WER columns rendered", quality.includes("CER") && quality.includes("WER"));

    // ---- A (continued): controlled provider failure -----------------------------
    section("A. Controlled provider failure (engine returns 500)");
    const failPath = await ta.createTask("Guardrail PROVIDER-FAIL task");
    const failId = failPath.split("/").pop();
    r = await ta.invoke(failPath, ids.runTranscription, [failId]);
    check("failure run returns without crash", r.status === 200, `status=${r.status}`);
    page = await (await ta.get(failPath)).text();
    check("no fabricated draft on failure", !page.includes(MOCK_DRAFT));
    check("controlled failure flag shown", /failed|unavailable/i.test(page));
    check("failure output still draft-gated", page.includes(DRAFT_WARNING));
    check("failure prompts retake or specialist transcription", page.includes(MANUAL_TRANSCRIPTION_WARNING));

    exitCode = failures.length ? 1 : 0;
  } catch (error) {
    console.error(`\nvalidator error: ${error.message}`);
    exitCode = 1;
  } finally {
    stopApp(app);
    mock.close();
    try {
      rmSync(DATA_DIR, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup of the throwaway store */
    }
  }

  console.log(
    `\n${failures.length ? `${failures.length}/${checks} CHECKS FAILED: ${failures.join("; ")}` : `ALL ${checks} CHECKS PASSED`}`,
  );
  console.log(
    "Reminder: OCR output is draft-only. QTVI/Braille-literate specialist verification remains mandatory.",
  );
  process.exit(exitCode);
}

main();
