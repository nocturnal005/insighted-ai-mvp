"use client";

import { Printer, ArrowLeft } from "lucide-react";

/** Print / back controls — hidden when actually printing. */
export function PrintActions() {
  return (
    <div className="mb-6 flex items-center justify-between print:hidden">
      <button
        onClick={() => history.back()}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <button
        onClick={() => window.print()}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
      >
        <Printer className="h-4 w-4" /> Print / Save as PDF
      </button>
    </div>
  );
}
