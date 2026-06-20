import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { buildExport, type ExportKind } from "@/lib/export-content";
import { markExported } from "@/lib/export-record";
import { PrintActions } from "./print-actions";

/**
 * Print-optimised export view. Opening it stamps the record as exported (audit) and the
 * user saves it as PDF via the browser print dialog — zero-dependency "PDF export".
 */
export default function PrintPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { kind?: string };
}) {
  const user = requireUser();
  const kind = searchParams.kind as ExportKind | undefined;
  if (!kind || !can(user.role, "export")) notFound();

  const { doc, error } = buildExport(kind, params.id);
  if (error || !doc) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-zinc-900">Cannot export yet</h1>
        <p className="mt-2 text-sm text-zinc-500">{error}</p>
      </main>
    );
  }

  markExported(kind, params.id, user, doc.title);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 print:py-0">
      <PrintActions />

      <article className="rounded-2xl border border-zinc-200 bg-white p-10 shadow-subtle print:border-0 print:p-0 print:shadow-none">
        <header className="mb-6 border-b border-zinc-200 pb-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-[11px] text-white">iE</span>
            InsightEd AI
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">{doc.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{doc.subtitle}</p>
          <p className="mt-3 inline-flex rounded-full bg-positive-50 px-2.5 py-0.5 text-xs font-medium text-positive-700">
            {doc.status}
          </p>
        </header>

        <div className="space-y-5">
          {doc.blocks.map((b, i) => (
            <section key={i}>
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{b.heading}</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{b.body}</p>
            </section>
          ))}
        </div>

        <footer className="mt-8 border-t border-zinc-200 pt-4 text-xs text-zinc-400">
          Exported from InsightEd AI · AI-assisted, staff-verified · not for redistribution outside the school.
        </footer>
      </article>
    </main>
  );
}
