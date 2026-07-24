import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const dataDir = join(process.cwd(), ".braivanta-data");

if (existsSync(dataDir)) {
  rmSync(dataDir, { recursive: true, force: true });
  console.log("Deleted .braivanta-data. Demo seed data will be recreated on next app start.");
} else {
  console.log("No .braivanta-data folder found. Demo seed data will be created on next app start.");
}
