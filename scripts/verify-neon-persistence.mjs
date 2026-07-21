import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL or POSTGRES_URL is required");
  process.exit(1);
}

const sql = neon(databaseUrl);

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

const taskId = `bt_neon_probe_${Date.now()}`;
const task = {
  id: taskId,
  organisationId: "org_runtime_probe",
  title: "Neon persistence probe",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

try {
  await sql`
    INSERT INTO insighted_braille_records (
      task_id, organisation_id, task, upload, audit, corrections, created_at, updated_at
    ) VALUES (
      ${taskId},
      ${task.organisationId},
      CAST(${JSON.stringify(task)} AS jsonb),
      NULL,
      '[]'::jsonb,
      '[]'::jsonb,
      ${task.createdAt},
      ${task.updatedAt}
    )
  `;

  const rows = await sql`
    SELECT task_id, task->>'title' AS title
    FROM insighted_braille_records
    WHERE task_id = ${taskId}
  `;

  if (rows.length !== 1 || rows[0].title !== task.title) {
    throw new Error("Neon persistence round-trip did not return the inserted record");
  }

  console.log(JSON.stringify({ ok: true, table: "insighted_braille_records", roundTripRows: rows.length }));
} finally {
  await sql`DELETE FROM insighted_braille_records WHERE task_id = ${taskId}`;
}
