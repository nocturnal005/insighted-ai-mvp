import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { buildExport, docToPlainText, isExportKind } from "@/lib/export-content";
import { markExported } from "@/lib/export-record";
import { hydrateBrailleTask } from "@/lib/durable-braille";
import { hydrateStemTask, hydrateVisualTask } from "@/lib/durable-demo";

// Reads the demo session cookie — never statically cached.
export const dynamic = "force-dynamic";

/**
 * GET /api/export/:id?kind=transcription|feedback|visual|stem
 * Returns a plain-text download. Enforces the approval gate and logs the export.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!can(user.role, "export")) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const kind = new URL(request.url).searchParams.get("kind");
  if (!isExportKind(kind)) return NextResponse.json({ error: "Invalid or missing export kind" }, { status: 400 });
  if (kind === "transcription" || kind === "feedback") await hydrateBrailleTask(params.id);
  else if (kind === "visual") await hydrateVisualTask(params.id);
  else await hydrateStemTask(params.id);

  const { doc, error } = buildExport(kind, params.id);
  if (error || !doc) return NextResponse.json({ error: error ?? "Not found" }, { status: 409 });

  await markExported(kind, params.id, user, doc.title);

  return new NextResponse(docToPlainText(doc), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${doc.filename}.txt"`,
    },
  });
}
