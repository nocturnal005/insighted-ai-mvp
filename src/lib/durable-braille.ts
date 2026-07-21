import { neon } from "@neondatabase/serverless";
import { db } from "@/lib/store";
import type { AuditEntry, BrailleTask, CorrectionPair, Upload } from "@/lib/types";

interface StoredBrailleTaskRow {
  task: BrailleTask | string;
}

interface StoredBrailleDetailRow extends StoredBrailleTaskRow {
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

function mergeTask(task: BrailleTask): BrailleTask {
  const taskIndex = db.brailleTasks.findIndex((item) => item.id === task.id);
  if (taskIndex >= 0) db.brailleTasks[taskIndex] = task;
  else db.brailleTasks.unshift(task);
  return task;
}

function mergeRecord(row: StoredBrailleDetailRow): BrailleTask {
  const task = mergeTask(jsonValue<BrailleTask>(row.task));
  const upload = row.upload ? jsonValue<Upload>(row.upload) : null;
  const audit = jsonValue<AuditEntry[]>(row.audit);
  const corrections = jsonValue<CorrectionPair[]>(row.corrections);

  const existingUpload = db.uploads.find((item) => item.taskId === task.id);
  db.uploads = db.uploads.filter((item) => item.taskId !== task.id);
  if (upload) {
    const existingHasBytes = Boolean(existingUpload?.dataUrl || existingUpload?.storagePath);
    const incomingHasBytes = Boolean(upload.dataUrl || upload.storagePath);
    db.uploads.push(
      existingHasBytes && !incomingHasBytes
        ? { ...upload, dataUrl: existingUpload?.dataUrl, storagePath: existingUpload?.storagePath ?? "" }
        : upload,
    );
  }

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
  // Detail hydration intentionally omits inline base64 bytes. Passing SQL NULL here
  // preserves the existing durable upload during text-only edits and approvals.
  const uploadJson = upload?.dataUrl || upload?.storagePath ? JSON.stringify(upload) : null;
  const audit = db.audit.filter((item) => item.taskId === task.id);
  const corrections = db.corrections.filter((item) => item.taskId === task.id);

  await sql`
    INSERT INTO insighted_braille_records (
      task_id, organisation_id, task, upload, audit, corrections, created_at, updated_at
    ) VALUES (
      ${task.id},
      ${task.organisationId},
      CAST(${JSON.stringify(task)} AS jsonb),
      CAST(${uploadJson} AS jsonb),
      CAST(${JSON.stringify(audit)} AS jsonb),
      CAST(${JSON.stringify(corrections)} AS jsonb),
      ${task.createdAt},
      ${task.updatedAt}
    )
    ON CONFLICT (task_id) DO UPDATE SET
      organisation_id = EXCLUDED.organisation_id,
      task = EXCLUDED.task,
      upload = COALESCE(EXCLUDED.upload, insighted_braille_records.upload),
      audit = EXCLUDED.audit,
      corrections = EXCLUDED.corrections,
      updated_at = EXCLUDED.updated_at
  `;
}

/** Load one durable record into the existing domain store used by the MVP UI. */
export async function hydrateBrailleTask(
  taskId: string,
  options: { includeUploadData?: boolean } = {},
): Promise<BrailleTask | undefined> {
  const sql = client();
  if (!sql) return db.brailleTasks.find((item) => item.id === taskId);
  await ensureSchema();

  const rows = (options.includeUploadData
    ? await sql`
        SELECT task, upload, audit, corrections
        FROM insighted_braille_records
        WHERE task_id = ${taskId}
        LIMIT 1
      `
    : await sql`
        SELECT task,
               CASE WHEN upload IS NULL THEN NULL ELSE upload - 'dataUrl' END AS upload,
               audit,
               corrections
        FROM insighted_braille_records
        WHERE task_id = ${taskId}
        LIMIT 1
      `) as unknown as StoredBrailleDetailRow[];

  if (!rows.length) return db.brailleTasks.find((item) => item.id === taskId);
  return mergeRecord(rows[0]);
}

/** Hydrate all durable Braille records for lists, dashboard counts, and queues. */
export async function hydrateBrailleTasks(): Promise<void> {
  const sql = client();
  if (!sql) return;
  await ensureSchema();

  const rows = (await sql`
    SELECT task
    FROM insighted_braille_records
    ORDER BY updated_at DESC
    LIMIT 500
  `) as unknown as StoredBrailleTaskRow[];

  // Summary routes need task fields only. Merging in one pass avoids repeatedly
  // filtering/sorting audit, correction, and upload arrays for every list row.
  const tasksById = new Map(db.brailleTasks.map((task) => [task.id, task]));
  for (const row of rows) {
    const task = jsonValue<BrailleTask>(row.task);
    tasksById.set(task.id, task);
  }
  db.brailleTasks = [...tasksById.values()];
}

/** Load the original bytes only for the protected source-image response or OCR. */
export async function hydrateBrailleUpload(taskId: string): Promise<Upload | undefined> {
  const local = [...db.uploads].reverse().find(
    (item) => item.taskId === taskId && Boolean(item.dataUrl || item.storagePath),
  );
  if (local) return local;

  const sql = client();
  if (!sql) return [...db.uploads].reverse().find((item) => item.taskId === taskId);
  await ensureSchema();

  const rows = (await sql`
    SELECT upload
    FROM insighted_braille_records
    WHERE task_id = ${taskId}
    LIMIT 1
  `) as unknown as Array<{ upload: Upload | string | null }>;
  const upload = rows[0]?.upload ? jsonValue<Upload>(rows[0].upload) : undefined;
  if (!upload) return undefined;

  db.uploads = db.uploads.filter((item) => item.taskId !== taskId);
  db.uploads.push(upload);
  return upload;
}
