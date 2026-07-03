/**
 * OPTIONAL live validation against the real standalone Braille OCR engine.
 *
 * NOT part of the default validation suite and not required for CI: it needs the
 * engine (a separate project, D:\insighted-braille-ocr-engine) already running:
 *
 *   cd D:\insighted-braille-ocr-engine
 *   $env:OCR_ENGINE_API_KEY="local-test-key"
 *   .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
 *
 * Run:  npm run validate:external-ocr:live
 * Env overrides: BRAILLE_OCR_ENDPOINT (default http://localhost:8000/ocr),
 *                BRAILLE_OCR_API_KEY  (default local-test-key — local throwaway value).
 *
 * Checks /health, /version, and POSTs a bundled synthetic Braille image with
 * `Authorization: Bearer <key>`, then validates the response against the same shape
 * the app's external_braille_ocr adapter (zod schema) requires. Synthetic image only —
 * never use real pupil data.
 */
import process from "node:process";

const ENDPOINT = process.env.BRAILLE_OCR_ENDPOINT || "http://localhost:8000/ocr";
const API_KEY = process.env.BRAILLE_OCR_API_KEY || "local-test-key";
const ENGINE_BASE = ENDPOINT.replace(/\/ocr\/?$/, "");

// Synthetic "hello world" Braille page from the engine's own sample generator.
const SYNTHETIC_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAaoAAACACAAAAAB/pHLOAAAB/0lEQVR4nO3asW6DMBRA0bjq//8yHaouTQbcuIQbzlk6gNBDVzjFYmw3Gj5ePQB7SZUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVYZUGVJlSJUhVcbn5PnjdtvOd3S/++scM/OC+cfUBcb3n+1cR/e7v84xMy+Z3wKYMZVq/Pp7jqP73V/nmJnXzO+pypDqPVP9/Cxupzq63/11jpl5zfyeqoy5f9a9V2Xeq3ghC2CGVJfYA5zdH1u1yzcm1/1VM8/e0d/O/Ic9wNn9sVW7fGP3mWtnnr2jZ2Z+yAL4/nuAs/tjq3b5xu4z1848e0fPzPyYpypDqvffA5zdH1u1y7ftPnPtzLN39MzMj3mqLrEH6L1qnPe9iheyAGZI9bZ7gM+42neAix33W3W17wCXswBmHJbqat8BruepypAq47BUV/sOcD1PVcaRG0tneIMZ3qv4dxbADKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKkypMqQKkOqDKluFV8ot6Xzb1ofUQAAAABJRU5ErkJggg==";

const FLAG_CATEGORIES = new Set([
  "low_image_quality",
  "low_ocr_confidence",
  "unclear_braille_cell",
  "possible_contraction_issue",
  "possible_number_sign_issue",
  "possible_capitalisation_issue",
  "line_order_uncertainty",
  "word_spacing_uncertainty",
  "subject_specific_term",
]);

const failures = [];
let checks = 0;

function check(name, ok, detail = "") {
  checks += 1;
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

function isValidFlag(flag) {
  return (
    typeof flag?.text === "string" &&
    typeof flag?.reason === "string" &&
    FLAG_CATEGORIES.has(flag?.category) &&
    ["low", "medium", "high"].includes(flag?.severity)
  );
}

async function main() {
  console.log(`Live external Braille OCR validation against ${ENGINE_BASE}`);
  console.log("(optional check — requires the standalone engine to be running separately)\n");

  let health;
  try {
    health = await (await fetch(`${ENGINE_BASE}/health`, { signal: AbortSignal.timeout(5000) })).json();
  } catch {
    console.error(
      `Engine not reachable at ${ENGINE_BASE}.\n` +
        "Start it first (see the script header), then re-run: npm run validate:external-ocr:live",
    );
    process.exit(1);
  }
  check("GET /health returns ok", health?.status === "ok", JSON.stringify(health));

  const version = await (await fetch(`${ENGINE_BASE}/version`)).json();
  check("GET /version identifies the engine", version?.name === "insighted-braille-ocr-engine", version?.version);
  check("version carries the draft-only warning", /draft/i.test(version?.warning ?? "") && /specialist/i.test(version?.warning ?? ""));

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      taskId: "validate-live-001",
      title: "Live validation synthetic sample",
      fileName: "synthetic-braille-sample.png",
      mimeType: "image/png",
      dataUrl: `data:image/png;base64,${SYNTHETIC_PNG_B64}`,
      subject: null,
      yearGroup: null,
    }),
  });
  check("POST /ocr accepts Authorization: Bearer", response.status === 200, `status=${response.status}`);

  const body = await response.json();

  // Shape checks mirroring the app adapter's zod schema (what it needs to consume).
  check("draftText is a string", typeof body.draftText === "string");
  check("confidence is a number in [0,1]", typeof body.confidence === "number" && body.confidence >= 0 && body.confidence <= 1);
  check("rawBraille is string or null", typeof body.rawBraille === "string" || body.rawBraille === null);
  check("rawCells is an array", Array.isArray(body.rawCells));
  check("providerRequestId is a non-empty string", typeof body.providerRequestId === "string" && body.providerRequestId.length > 0);
  check("flags is an array of valid flags", Array.isArray(body.flags) && body.flags.every(isValidFlag));
  check(
    "pageResults is an array of valid pages",
    Array.isArray(body.pageResults) &&
      body.pageResults.every(
        (p) => typeof p.pageNumber === "number" && typeof p.text === "string" && typeof p.confidence === "number" && Array.isArray(p.flags),
      ),
  );
  check("synthetic sample decodes to the expected draft", body.draftText.trim() === "hello world", JSON.stringify(body.draftText));
  check("adapter-compatible response (all schema fields consumable)", true, "matches external-braille-provider zod schema");

  const denied = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId: "validate-live-002",
      title: "auth check",
      fileName: "x.png",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,QUJD",
    }),
  });
  check("missing key rejected (401)", denied.status === 401, `status=${denied.status}`);

  console.log(
    `\n${failures.length ? `${failures.length}/${checks} CHECKS FAILED: ${failures.join("; ")}` : `ALL ${checks} CHECKS PASSED`}`,
  );
  console.log("Reminder: engine output is draft-only and requires QTVI/Braille-literate specialist verification.");
  // Let Node drain keep-alive sockets and exit naturally; process.exit() here trips a
  // libuv teardown assertion on Windows and corrupts the exit code.
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
  console.error(`validator error: ${error.message}`);
  process.exitCode = 1;
});
