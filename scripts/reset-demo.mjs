import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const dataDir = join(process.cwd(), ".insighted-data");

if (existsSync(dataDir)) {
  rmSync(dataDir, { recursive: true, force: true });
  console.log("Deleted .insighted-data. Demo seed data will be recreated on next app start.");
} else {
  console.log("No .insighted-data folder found. Demo seed data will be created on next app start.");
}
