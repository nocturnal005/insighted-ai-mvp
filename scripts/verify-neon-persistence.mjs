import { neon } from "@neondatabase/serverless";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.NEON_DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL, POSTGRES_URL, or NEON_DATABASE_URL is required");
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

const probeSuffix = Date.now();
const brailleTaskId = `bt_neon_probe_${probeSuffix}`;
const visualTaskId = `vd_neon_probe_${probeSuffix}`;
const createdAt = new Date().toISOString();
const brailleTask = {
  id: brailleTaskId,
  organisationId: "org_runtime_probe",
  title: "Neon Braille persistence probe",
  createdAt,
  updatedAt: createdAt,
};
const visualTask = {
  id: visualTaskId,
  organisationId: "org_runtime_probe",
  title: "Neon visual persistence probe",
  createdAt,
  updatedAt: createdAt,
};
const visualUpload = {
  id: `up_neon_probe_${probeSuffix}`,
  organisationId: visualTask.organisationId,
  taskId: visualTaskId,
  module: "visual",
  fileName: "probe.png",
  fileType: "image/png",
  byteSize: 1,
  storagePath: "",
  dataUrl: "data:image/png;base64,AA==",
  uploadedBy: "runtime_probe",
  createdAt,
};

try {
  await sql`
    INSERT INTO insighted_braille_records (
      task_id, organisation_id, task, upload, audit, corrections, created_at, updated_at
    ) VALUES (
      ${brailleTaskId},
      ${brailleTask.organisationId},
      CAST(${JSON.stringify(brailleTask)} AS jsonb),
      NULL,
      '[]'::jsonb,
      '[]'::jsonb,
      ${brailleTask.createdAt},
      ${brailleTask.updatedAt}
    )
  `;

  await sql`
    INSERT INTO insighted_demo_records (
      task_id, module, organisation_id, task, upload, audit, created_at, updated_at
    ) VALUES (
      ${visualTaskId},
      'visual',
      ${visualTask.organisationId},
      CAST(${JSON.stringify(visualTask)} AS jsonb),
      CAST(${JSON.stringify(visualUpload)} AS jsonb),
      '[]'::jsonb,
      ${visualTask.createdAt},
      ${visualTask.updatedAt}
    )
  `;

  const brailleRows = await sql`
    SELECT task_id, task->>'title' AS title
    FROM insighted_braille_records
    WHERE task_id = ${brailleTaskId}
  `;
  const visualRows = await sql`
    SELECT task_id, task->>'title' AS title, upload->>'dataUrl' AS data_url
    FROM insighted_demo_records
    WHERE task_id = ${visualTaskId}
  `;

  if (
    brailleRows.length !== 1 ||
    brailleRows[0].title !== brailleTask.title
  ) {
    throw new Error("Braille persistence round-trip did not return the inserted record");
  }
  if (
    visualRows.length !== 1 ||
    visualRows[0].title !== visualTask.title ||
    visualRows[0].data_url !== visualUpload.dataUrl
  ) {
    throw new Error("Assessment/STEM persistence round-trip did not preserve task and upload data");
  }

  console.log(
    JSON.stringify({
      ok: true,
      tables: ["insighted_braille_records", "insighted_demo_records"],
      roundTripRows: brailleRows.length + visualRows.length,
      durableUpload: true,
    }),
  );
} finally {
  await sql`DELETE FROM insighted_braille_records WHERE task_id = ${brailleTaskId}`;
  await sql`DELETE FROM insighted_demo_records WHERE task_id = ${visualTaskId}`;
}
