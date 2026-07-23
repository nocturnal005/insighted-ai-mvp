import { neon } from "@neondatabase/serverless";
import { db, uploadDataUrl } from "@/lib/store";
import type {
  AuditEntry,
  StemTask,
  Upload,
  VisualDescriptionTask,
} from "@/lib/types";

type DurableModule = "visual" | "stem";
type DurableTask = VisualDescriptionTask | StemTask;

interface StoredTaskRow {
  task: DurableTask | string;
}

interface StoredDetailRow extends StoredTaskRow {
  module: DurableModule;
  upload: Upload | string | null;
  audit: AuditEntry[] | string;
}

const schemaPromiseKey = "__insighted_demo_schema";

function databaseUrl(): string | null {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    null
  );
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
      CREATE TABLE IF NOT EXISTS insighted_demo_records (
        task_id text PRIMARY KEY,
        module text NOT NULL,
        organisation_id text NOT NULL,
        task jsonb NOT NULL,
        upload jsonb,
        audit jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT insighted_demo_records_module
          CHECK (module IN ('visual', 'stem'))
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

function mergeTask(module: DurableModule, task: DurableTask): DurableTask {
  if (module === "visual") {
    const visual = task as VisualDescriptionTask;
    const index = db.visualTasks.findIndex((item) => item.id === visual.id);
    if (index >= 0) db.visualTasks[index] = visual;
    else db.visualTasks.unshift(visual);
    return visual;
  }

  const stem = task as StemTask;
  const index = db.stemTasks.findIndex((item) => item.id === stem.id);
  if (index >= 0) db.stemTasks[index] = stem;
  else db.stemTasks.unshift(stem);
  return stem;
}

function mergeRecord(row: StoredDetailRow): DurableTask {
  const task = mergeTask(row.module, jsonValue<DurableTask>(row.task));
  const upload = row.upload ? jsonValue<Upload>(row.upload) : null;

  if (upload) {
    const existing = [...db.uploads].reverse().find((item) => item.taskId === task.id);
    const existingHasBytes = Boolean(existing?.dataUrl || existing?.storagePath);
    const incomingHasBytes = Boolean(upload.dataUrl || upload.storagePath);
    db.uploads = db.uploads.filter((item) => item.taskId !== task.id);
    db.uploads.push(
      existingHasBytes && !incomingHasBytes
        ? {
            ...upload,
            dataUrl: existing?.dataUrl,
            storagePath: existing?.storagePath ?? "",
          }
        : upload,
    );
  }

  const audit = jsonValue<AuditEntry[]>(row.audit);
  db.audit = db.audit.filter((item) => item.taskId !== task.id);
  db.audit.push(...audit);
  db.audit.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return task;
}

function portableUpload(taskId: string): Upload | null {
  const upload = [...db.uploads].reverse().find((item) => item.taskId === taskId);
  if (!upload) return null;
  const dataUrl = uploadDataUrl(upload);
  if (!dataUrl) return null;
  return { ...upload, storagePath: "", dataUrl };
}

async function persistTask(
  module: DurableModule,
  task: DurableTask,
  options: { includeUploadData?: boolean } = {},
): Promise<void> {
  const sql = client();
  if (!sql) return;
  await ensureSchema();

  const upload = options.includeUploadData ? portableUpload(task.id) : null;
  const uploadJson = upload ? JSON.stringify(upload) : null;
  const audit = db.audit.filter((item) => item.taskId === task.id);

  await sql`
    INSERT INTO insighted_demo_records (
      task_id, module, organisation_id, task, upload, audit, created_at, updated_at
    ) VALUES (
      ${task.id},
      ${module},
      ${task.organisationId},
      CAST(${JSON.stringify(task)} AS jsonb),
      CAST(${uploadJson} AS jsonb),
      CAST(${JSON.stringify(audit)} AS jsonb),
      ${task.createdAt},
      ${task.updatedAt}
    )
    ON CONFLICT (task_id) DO UPDATE SET
      module = EXCLUDED.module,
      organisation_id = EXCLUDED.organisation_id,
      task = EXCLUDED.task,
      upload = COALESCE(EXCLUDED.upload, insighted_demo_records.upload),
      audit = EXCLUDED.audit,
      updated_at = EXCLUDED.updated_at
  `;
}

async function hydrateTask(
  module: DurableModule,
  taskId: string,
  options: { includeUploadData?: boolean } = {},
): Promise<DurableTask | undefined> {
  const local =
    module === "visual"
      ? db.visualTasks.find((item) => item.id === taskId)
      : db.stemTasks.find((item) => item.id === taskId);
  const sql = client();
  if (!sql) return local;
  await ensureSchema();

  const rows = (options.includeUploadData
    ? await sql`
        SELECT module, task, upload, audit
        FROM insighted_demo_records
        WHERE task_id = ${taskId} AND module = ${module}
        LIMIT 1
      `
    : await sql`
        SELECT module,
               task,
               CASE WHEN upload IS NULL THEN NULL ELSE upload - 'dataUrl' END AS upload,
               audit
        FROM insighted_demo_records
        WHERE task_id = ${taskId} AND module = ${module}
        LIMIT 1
      `) as unknown as StoredDetailRow[];

  return rows.length ? mergeRecord(rows[0]) : local;
}

async function hydrateTasks(module: DurableModule): Promise<void> {
  const sql = client();
  if (!sql) return;
  await ensureSchema();

  const rows = (await sql`
    SELECT task
    FROM insighted_demo_records
    WHERE module = ${module}
    ORDER BY updated_at DESC
    LIMIT 500
  `) as unknown as StoredTaskRow[];

  if (module === "visual") {
    const byId = new Map(db.visualTasks.map((task) => [task.id, task]));
    for (const row of rows) {
      const task = jsonValue<VisualDescriptionTask>(
        row.task as VisualDescriptionTask | string,
      );
      byId.set(task.id, task);
    }
    db.visualTasks = [...byId.values()];
    return;
  }

  const byId = new Map(db.stemTasks.map((task) => [task.id, task]));
  for (const row of rows) {
    const task = jsonValue<StemTask>(row.task as StemTask | string);
    byId.set(task.id, task);
  }
  db.stemTasks = [...byId.values()];
}

export function persistVisualTask(
  task: VisualDescriptionTask,
  options?: { includeUploadData?: boolean },
): Promise<void> {
  return persistTask("visual", task, options);
}

export function persistStemTask(
  task: StemTask,
  options?: { includeUploadData?: boolean },
): Promise<void> {
  return persistTask("stem", task, options);
}

export async function hydrateVisualTask(
  taskId: string,
  options?: { includeUploadData?: boolean },
): Promise<VisualDescriptionTask | undefined> {
  return (await hydrateTask("visual", taskId, options)) as
    | VisualDescriptionTask
    | undefined;
}

export async function hydrateStemTask(
  taskId: string,
  options?: { includeUploadData?: boolean },
): Promise<StemTask | undefined> {
  return (await hydrateTask("stem", taskId, options)) as StemTask | undefined;
}

export function hydrateVisualTasks(): Promise<void> {
  return hydrateTasks("visual");
}

export function hydrateStemTasks(): Promise<void> {
  return hydrateTasks("stem");
}

/** Load durable Assessment/STEM source bytes only when a workflow actually needs them. */
export async function hydrateDemoUpload(taskId: string): Promise<Upload | undefined> {
  const local = [...db.uploads].reverse().find(
    (item) => item.taskId === taskId && Boolean(item.dataUrl || item.storagePath),
  );
  if (local) return local;

  const sql = client();
  if (!sql) return [...db.uploads].reverse().find((item) => item.taskId === taskId);
  await ensureSchema();

  const rows = (await sql`
    SELECT upload
    FROM insighted_demo_records
    WHERE task_id = ${taskId}
    LIMIT 1
  `) as unknown as Array<{ upload: Upload | string | null }>;
  const upload = rows[0]?.upload
    ? jsonValue<Upload>(rows[0].upload)
    : undefined;
  if (!upload) return undefined;

  db.uploads = db.uploads.filter((item) => item.taskId !== taskId);
  db.uploads.push(upload);
  return upload;
}
