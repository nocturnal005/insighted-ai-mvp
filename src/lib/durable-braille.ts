import { neon } from "@neondatabase/serverless";
import { db } from "@/lib/store";
import type { AuditEntry, BrailleTask, CorrectionPair, Upload } from "@/lib/types";

interface StoredBrailleRow {
  task: BrailleTask | string;
  upload: Upload | string | null;
  audit: AuditEntry[] | string;
  corrections: CorrectionPair[] | string;
}

const schemaPromiseKey = "__insighted_braille_schema";

function databaseUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}

function client() {
  const url = databaseUrl();
  return url ? neon(url) : null;
}

async function ensureSchema(): Promise<void> {
  const sql = client();
  if (!sql) return;

  const globalState = globalThis as unknown as Record<string, Promise<void> | undefined>;
  globalState[schemaPromiseKey] ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS insighted_braille_records (
        task_id text PRIMARY KEY,
        organisation_id text NOT NULL,
        task jsonb NOT NULL,
        upload jsonb,
        audit jsonb NOT NULL DEFAULT '[]'::jsonb,
        corrections jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
  })();

  try {
    await globalState[schemaPromiseKey];
  } catch (error) {
    delete globalState[schemaPromiseKey];
    throw error;
  }
}

function jsonValue<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function mergeRecord(row: StoredBrailleRow): BrailleTask {
  const task = jsonValue<BrailleTask>(row.task);
  const upload = row.upload ? jsonValue<Upload>(row.upload) : null;
  const audit = jsonValue<AuditEntry[]>(row.audit);
  const corrections = jsonValue<CorrectionPair[]>(row.corrections);

  const taskIndex = db.brailleTasks.findIndex((item) => item.id === task.id);
  if (taskIndex >= 0) db.brailleTasks[taskIndex] = task;
  else db.brailleTasks.unshift(task);

  db.uploads = db.uploads.filter((item) => item.taskId !== task.id);
  if (upload) db.uploads.push(upload);

  db.audit = db.audit.filter((item) => item.taskId !== task.id);
  db.audit.push(...audit);
  db.audit.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  db.corrections = db.corrections.filter((item) => item.taskId !== task.id);
  db.corrections.push(...corrections);

  return task;
}

/** Persist one complete Braille OCR/review record, including its source image and audit. */
export async function persistBrailleTask(task: BrailleTask): Promise<void> {
  const sql = client();
  if (!sql) return;
  await ensureSchema();

  const upload = [...db.uploads].reverse().find((item) => item.taskId === task.id) ?? null;
  const audit = db.audit.filter((item) => item.taskId === task.id);
  const corrections = db.corrections.filter((item) => item.taskId === task.id);

  await sql`
    INSERT INTO insighted_braille_records (
      task_id, organisation_id, task, upload, audit, corrections, created_at, updated_at
    ) VALUES (
      ${task.id},
      ${task.organisationId},
      CAST(${JSON.stringify(task)} AS jsonb),
      CAST(${JSON.stringify(upload)} AS jsonb),
      CAST(${JSON.stringify(audit)} AS jsonb),
      CAST(${JSON.stringify(corrections)} AS jsonb),
      ${task.createdAt},
      ${task.updatedAt}
    )
    ON CONFLICT (task_id) DO UPDATE SET
      organisation_id = EXCLUDED.organisation_id,
      task = EXCLUDED.task,
      upload = EXCLUDED.upload,
      audit = EXCLUDED.audit,
      corrections = EXCLUDED.corrections,
      updated_at = EXCLUDED.updated_at
  `;
}

/** Load one durable record into the existing domain store used by the MVP UI. */
export async function hydrateBrailleTask(taskId: string): Promise<BrailleTask | undefined> {
  const sql = client();
  if (!sql) return db.brailleTasks.find((item) => item.id === taskId);
  await ensureSchema();

  const rows = (await sql`
    SELECT task, upload, audit, corrections
    FROM insighted_braille_records
    WHERE task_id = ${taskId}
    LIMIT 1
  `) as unknown as StoredBrailleRow[];

  if (!rows.length) return db.brailleTasks.find((item) => item.id === taskId);
  return mergeRecord(rows[0]);
}

/** Hydrate all durable Braille records for lists, dashboard counts, and queues. */
export async function hydrateBrailleTasks(): Promise<void> {
  const sql = client();
  if (!sql) return;
  await ensureSchema();

  const rows = (await sql`
    SELECT task, upload, audit, corrections
    FROM insighted_braille_records
    ORDER BY updated_at DESC
    LIMIT 500
  `) as unknown as StoredBrailleRow[];

  for (const row of rows) mergeRecord(row);
}
