import Link from "next/link";
import { FileDown, Printer } from "lucide-react";
import type { ExportKind } from "@/lib/export-content";

/** Export controls shared across modules: text download + print/PDF. */
export function ExportMenu({ id, kind, label = "Export" }: { id: string; kind: ExportKind; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="eyebrow mr-1">{label}</span>
      <a
        href={`/api/export/${id}?kind=${kind}`}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-[13px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
      >
        <FileDown className="h-3.5 w-3.5" /> Download text
      </a>
      <Link
        href={`/print/${id}?kind=${kind}`}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-zinc-800"
      >
        <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
      </Link>
    </div>
  );
}
