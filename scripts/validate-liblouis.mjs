/**
 * Local Liblouis runtime validation.
 *
 * Uses only synthetic Unicode Braille samples. It does not contact a provider, read
 * .env.local, or process pupil data.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = path.join(root, ".tools", "liblouis", "3.38.0");
const command = path.join(runtime, "bin", "lou_translate.exe");
const tables = path.join(runtime, "share", "liblouis", "tables");
const table = path.join(tables, "en-ueb-g2.ctb");
const displayTable = path.join(tables, "unicode.dis");

for (const required of [command, table, displayTable]) {
  if (!existsSync(required)) {
    console.error(`Liblouis runtime file is missing: ${required}`);
    console.error("Run npm run setup:liblouis, then retry this validation.");
    process.exit(1);
  }
}

const result = spawnSync(
  command,
  ["--backward", "--display-table", displayTable, table],
  {
    input: "⠠⠮ ⠟⠅ ⠃⠗⠪⠝ ⠋⠕⠭\n",
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  },
);

if (result.error || result.status !== 0) {
  console.error("Liblouis process did not complete successfully.");
  process.exit(1);
}

const actual = result.stdout.trim();
const expected = "The quick brown fox";
if (actual !== expected) {
  console.error(`Liblouis back-translation mismatch. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  process.exit(1);
}

console.log(`Liblouis back-translation passed: ${JSON.stringify(actual)}`);

console.log("Running the offline hybrid workflow with the installed Liblouis runtime...");
const hybrid = spawnSync(process.execPath, ["scripts/validate-abc-braille.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    BRAILLE_CONTRACT_PROVIDER: "abc_openai_review",
    LIBLOUIS_CONTRACT_ENABLED: "true",
  },
  stdio: "inherit",
});
if (hybrid.status !== 0) process.exit(hybrid.status ?? 1);
console.log("Installed Liblouis hybrid workflow validation passed.");
