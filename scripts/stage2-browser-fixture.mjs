/** Isolated local Stage 2 browser-acceptance fixture. Synthetic data only. */
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "braivanta-stage2-browser-"));
const APP_PORT = 3994;
const OCR_PORT = 8992;
const BASE = `http://127.0.0.1:${APP_PORT}`;
const NEXT_DIST_DIR = `.next-stage2-browser-${process.pid}`;
const NEXT_TSCONFIG = `.tsconfig-stage2-browser-${process.pid}.json`;
const FLAG_TEXT = "uncertain phrase browser-2f7a";
const DRAFT = `Ordinary translated content stays quiet. ${FLAG_TEXT}. The final sentence is ordinary.`;

writeFileSync(
  path.join(ROOT, NEXT_TSCONFIG),
  `${JSON.stringify({ extends: "./tsconfig.json" }, null, 2)}\n`,
);

const engine = http.createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    JSON.parse(body || "{}");
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      draftText: DRAFT,
      confidence: 0.72,
      providerRequestId: "stage2_browser_fixture",
      flags: [{
        text: FLAG_TEXT,
        reason: "The OCR provider marked this exact phrase for specialist attention.",
        category: "low_ocr_confidence",
        severity: "high",
      }],
      pageResults: [{ pageNumber: 1, text: DRAFT, confidence: 0.72, flags: [] }],
    }));
  });
});

function stopTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

engine.listen(OCR_PORT, "127.0.0.1");
const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const app = spawn(process.execPath, [nextBin, "dev", "--webpack", "-p", String(APP_PORT)], {
  cwd: ROOT,
  env: {
    ...process.env,
    AI_MODE: "real",
    AI_PROVIDER: "mock",
    BRAILLE_OCR_PROVIDER: "external_braille_ocr",
    BRAILLE_OCR_ENDPOINT: `http://127.0.0.1:${OCR_PORT}/ocr`,
    BRAILLE_OCR_API_KEY: "stage2-browser-fixture",
    DEMO_MODE: "true",
    DATABASE_URL: "",
    POSTGRES_URL: "",
    NEON_DATABASE_URL: "",
    BRAIVANTA_DATA_DIR: DATA_DIR,
    BRAIVANTA_NEXT_DIST_DIR: NEXT_DIST_DIR,
    BRAIVANTA_TSCONFIG_PATH: NEXT_TSCONFIG,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
app.stdout.pipe(process.stdout);
app.stderr.pipe(process.stderr);

const cleanup = () => {
  stopTree(app);
  engine.close();
  rmSync(path.join(ROOT, NEXT_DIST_DIR), { recursive: true, force: true });
  rmSync(path.join(ROOT, NEXT_TSCONFIG), { force: true });
  rmSync(DATA_DIR, { recursive: true, force: true });
};
process.once("SIGINT", () => { cleanup(); process.exit(0); });
process.once("SIGTERM", () => { cleanup(); process.exit(0); });

const deadline = Date.now() + 180_000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${BASE}/login`);
    if (response.ok) {
      console.log(`STAGE2_FIXTURE_READY ${BASE}`);
      break;
    }
  } catch {
    // Continue until the dev server is accepting requests.
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
await new Promise(() => {});
