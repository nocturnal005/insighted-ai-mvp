import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { buildExport, docToPlainText, type ExportKind } from "@/lib/export-content";
import { markExported } from "@/lib/export-record";

/**
 * GET /api/export/:id?kind=transcription|feedback|visual|stem
 * Returns a plain-text download. Enforces the approval gate and logs the export.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (!can(user.role, "export")) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const kind = new URL(request.url).searchParams.get("kind") as ExportKind | null;
  if (!kind) return NextResponse.json({ error: "Missing kind" }, { status: 400 });

  const { doc, error } = buildExport(kind, params.id);
  if (error || !doc) return NextResponse.json({ error: error ?? "Not found" }, { status: 409 });

  markExported(kind, params.id, user, doc.title);

  return new NextResponse(docToPlainText(doc), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${doc.filename}.txt"`,
    },
  });
}
