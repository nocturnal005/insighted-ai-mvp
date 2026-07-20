/**
 * Contract validation for the ABC Braille web adapter.
 *
 * Runs a local facsimile of ABC Braille's upload -> scan -> HTML results workflow,
 * boots InsightEd against it, and proves Run transcription persists the returned ordered
 * text exactly. No real pupil data and no internet connection are used.
 */
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "insighted-abc-"));
const APP_PORT = 3994;
const ABC_PORT = 8992;
const BASE = `http://127.0.0.1:${APP_PORT}`;
const ABC_BASE = `http://127.0.0.1:${ABC_PORT}`;
const CONTRACT_PROVIDER =
  process.env.BRAILLE_CONTRACT_PROVIDER === "abc_openai_review"
    ? "abc_openai_review"
    : "abc_braille_web";
const CONTRACT_LIBLOUIS_ENABLED = process.env.LIBLOUIS_CONTRACT_ENABLED === "true";
const LIBLOUIS_RUNTIME = path.join(ROOT, ".tools", "liblouis", "3.38.0");
const EXACT_DRAFT = 'Alpha & beta\nLine two — exactly\nQuotes "stay" word for word.';
const SYNTHETIC_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAaoAAACACAAAAAB/pHLOAAAB/0lEQVR4nO3asW6DMBRA0bjq//8yHaouTQbcuIQbzlk6gNBDVzjFYmw3Gj5ePQB7SZUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVcbn5PnjdtvOd3S/++scM/OC+cfUBcb3n+1cR/e7v84xMy+Z3wKYMZVq/Pp7jqP73V/nmJnXzO+pypDqPVP9/Cxupzq63/11jpl5zfyeqoy5f9a9V2Xeq3ghC2CGVJfYA5zdH1u1yzcm1/1VM8/e0d/O/Ic9wNn9sVW7fGP3mWtnnr2jZ2Z+yAL4/nuAs/tjq3b5xu4z1848e0fPzPyYpypDqvffA5zdH1u1y7ftPnPtzLN39MzMj3mqLrEH6L1qnPe9iheyAGZI9bZ7gM+42neAix33W3W17wCXswBmHJbqat8BruepypAq47BUV/sOcD1PVcaRG0tneIMZ3qv4dxbADKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKluFV8ot6Xzb1ofUQAAAABJRU5ErkJggg==";

const failures = [];
let checks = 0;
function check(name, ok, detail = "") {
  checks += 1;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

function collect(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function startAbcFacsimile(requests) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", ABC_BASE);
    const body = await collect(req);
    requests.push({ method: req.method, path: url.pathname, search: url.search, headers: req.headers, body });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (req.method === "POST" && url.pathname === "/") {
      res.end('<form id="rotate_form" method="post" action="/scan_image/contract-token.jpg"></form>');
      return;
    }
    if (req.method === "POST" && url.pathname === "/scan_image/contract-token.jpg") {
      res.end("<script>window.location.replace('/translate_image/contract-token.jpg?TABLE=en-ueb-g2.ctb');</script>");
      return;
    }
    if (req.method === "GET" && url.pathname === "/translate_image/contract-token.jpg") {
      res.end(`
        <h4>Braille Scanned</h4><ol><li>⠠⠁</li><li>⠃</li></ol>
        <h4> Text translation</h4>
        <ol>
          <li>Alpha &amp; beta</li>
          <li>Line two — exactly</li>
          <li>Quotes &quot;stay&quot; word for word.</li>
        </ol>
      `);
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  return new Promise((resolve) => server.listen(ABC_PORT, "127.0.0.1", () => resolve(server)));
}

function startApp() {
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(APP_PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      // ABC is a real network provider even though this contract points it at a local
      // facsimile. Keep real dispatch enabled; the facsimile makes the test offline.
      AI_MODE: "real",
      BRAILLE_OCR_PROVIDER: CONTRACT_PROVIDER,
      ABC_BRAILLE_BASE_URL: ABC_BASE,
      ABC_BRAILLE_TIMEOUT_MS: "10000",
      // Hybrid contract runs must remain offline and spend no API credit.
      OPENAI_API_KEY: "",
      LIBLOUIS_ENABLED: CONTRACT_LIBLOUIS_ENABLED ? "true" : "false",
      LIBLOUIS_COMMAND: CONTRACT_LIBLOUIS_ENABLED
        ? path.join(LIBLOUIS_RUNTIME, "bin", "lou_translate.exe")
        : "",
      LIBLOUIS_TABLE: CONTRACT_LIBLOUIS_ENABLED
        ? path.join(LIBLOUIS_RUNTIME, "share", "liblouis", "tables", "en-ueb-g2.ctb")
        : "en-ueb-g2.ctb",
      LIBLOUIS_DISPLAY_TABLE: CONTRACT_LIBLOUIS_ENABLED
        ? path.join(LIBLOUIS_RUNTIME, "share", "liblouis", "tables", "unicode.dis")
        : "unicode.dis",
      DEMO_MODE: "true",
      ALLOW_REAL_PUPIL_DATA: "",
      INSIGHTED_DATA_DIR: DATA_DIR,
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
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

async function waitForApp(timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/login`)).status === 200) return;
    } catch {
      // App is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("app did not become ready");
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
  cookie = "";
  headers(extra = {}) {
    return { Origin: BASE, ...(this.cookie ? { Cookie: this.cookie } : {}), ...extra };
  }
  async get(pathName) {
    return fetch(`${BASE}${pathName}`, { redirect: "manual", headers: this.headers() });
  }
  async login() {
    const page = await (await this.get("/login")).text();
    const actionId = extractFormActionId(page, 'value="u_amelia"');
    const form = new FormData();
    form.set(`$ACTION_ID_${actionId}`, "");
    form.set("userId", "u_amelia");
    const response = await fetch(`${BASE}/login`, { method: "POST", redirect: "manual", body: form });
    this.cookie = (response.headers.get("set-cookie") || "").split(";")[0];
    if (response.status !== 303 || !this.cookie) throw new Error(`login failed (${response.status})`);
    return this;
  }
  async createTask() {
    const page = await (await this.get("/braille/new")).text();
    const actionId = extractFormActionId(page, 'name="title"');
    const form = new FormData();
    form.set(`$ACTION_ID_${actionId}`, "");
    form.set("title", "Exact-text transcription task");
    form.set("subject", "English");
    form.set("pupilId", "");
    form.set("image", new Blob([Buffer.from(SYNTHETIC_PNG_B64, "base64")], { type: "image/png" }), "synthetic.png");
    const response = await fetch(`${BASE}/braille/new`, {
      method: "POST",
      redirect: "manual",
      headers: this.headers(),
      body: form,
    });
    const location = (response.headers.get("x-action-redirect") || response.headers.get("location") || "").split("?")[0];
    if (response.status !== 303 || !location.includes("/braille/bt")) throw new Error(`task creation failed (${response.status})`);
    return location;
  }
  async invoke(pathName, actionId, args) {
    return fetch(`${BASE}${pathName}`, {
      method: "POST",
      redirect: "manual",
      headers: this.headers({ "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8" }),
      body: JSON.stringify(args),
    });
  }
}

function brailleActionIds() {
  const compiled = readFileSync(path.join(ROOT, ".next", "server", "app", "(app)", "braille", "new", "page.js"), "utf8");
  for (const match of compiled.matchAll(/__next_internal_action_entry_do_not_use__ \{([^}]+)\}/g)) {
    if (!match[1].includes("runTranscription")) continue;
    const ids = {};
    for (const pair of match[1].matchAll(/\\?"([a-f0-9]{40})\\?":\\?"(\w+)\\?"/g)) ids[pair[2]] = pair[1];
    return ids;
  }
  throw new Error("braille action ids not found");
}

async function main() {
  console.log(`${CONTRACT_PROVIDER} contract: local ABC facsimile + exact text persistence`);
  const requests = [];
  const abc = await startAbcFacsimile(requests);
  const app = startApp();
  try {
    await waitForApp();
    const session = await new Session().login();
    const taskPath = await session.createTask();
    const taskId = taskPath.split("/").pop();
    const response = await session.invoke(taskPath, brailleActionIds().runTranscription, [taskId]);
    check("Run transcription completes", response.status === 200, `status=${response.status}`);

    const stored = JSON.parse(readFileSync(path.join(DATA_DIR, "db.json"), "utf8"));
    const task = stored.brailleTasks.find((candidate) => candidate.id === taskId);
    check("ABC output is stored word for word", task?.transcription?.draftText === EXACT_DRAFT);
    check("editable pane value starts as the exact ABC output", task?.transcription?.editedText === EXACT_DRAFT);
    check("private provider provenance remains server-side", task?.transcription?.aiProvider === CONTRACT_PROVIDER);
    check("no confidence score is fabricated", task?.transcription?.confidence === 0);
    if (CONTRACT_PROVIDER === "abc_openai_review") {
      check("hybrid keeps the ABC text as the primary draft", task?.transcription?.draftText === EXACT_DRAFT);
      check("missing secondary services are controlled", task?.transcription?.review?.status === "unavailable");
      check("secondary review never writes a replacement", task?.transcription?.review?.discrepancies?.length === 0);
      if (CONTRACT_LIBLOUIS_ENABLED) {
        check("deterministic back-translation ran", task?.transcription?.review?.backTranslationAvailable === true);
        check("back-translation evidence is retained", Boolean(task?.transcription?.review?.backTranslationText));
        check("engine agreement is calculated", typeof task?.transcription?.review?.primaryBackTranslationAgreement === "number");
        check("confidence is identified as consensus", task?.transcription?.confidenceBasis === "consensus");
      } else {
        check("consensus confidence is withheld without Liblouis", task?.transcription?.confidenceBasis === "not_supplied");
      }
    }

    check("three-step ABC workflow used", requests.length === 3, requests.map((request) => `${request.method} ${request.path}`).join(", "));
    check("image sent as multipart file", requests[0]?.body.includes(Buffer.from('name="file"')));
    check("UEB Grade 2 requested", requests[1]?.body.toString("utf8").includes("translatetable=en-ueb-g2.ctb"));
    check("result route keeps selected table", requests[2]?.search === "?TABLE=en-ueb-g2.ctb");

    const page = await (await session.get(taskPath)).text();
    check("manual import control removed", !page.includes("Import real result") && !page.includes("ImportDraftEditor"));
    check(
      "private provider identity is absent from staff-facing HTML",
      !page.includes("abc_braille_web") && !page.includes("abc-braille-") && !page.includes("ABC Braille"),
    );
    check("staff-facing provenance is generic", page.includes("Live transcription"));
    if (CONTRACT_PROVIDER === "abc_openai_review") {
      check("hybrid evidence panel is rendered", page.includes("Hybrid review evidence"));
      check("UI says suggestions are never auto-applied", page.includes("never applied automatically"));
      check(
        "hybrid implementation identities remain server-side",
        !page.includes("abc_openai_review") && !page.includes("OpenAI") && !page.includes("Liblouis"),
      );
      if (CONTRACT_LIBLOUIS_ENABLED) {
        check("staff UI labels consensus confidence", page.includes("Consensus confidence"));
        check("staff UI includes deterministic evidence", page.includes("Deterministic back-translation"));
      }
    }
  } finally {
    stopApp(app);
    abc.close();
    rmSync(DATA_DIR, { recursive: true, force: true });
  }

  console.log(failures.length ? `\n${failures.length}/${checks} CHECKS FAILED: ${failures.join("; ")}` : `\nALL ${checks} CHECKS PASSED`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
