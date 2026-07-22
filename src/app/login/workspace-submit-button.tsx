"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export function WorkspaceSubmitButton({
  ariaLabel,
  highlight,
  children,
}: {
  ariaLabel: string;
  highlight: boolean;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      aria-label={ariaLabel}
      aria-busy={pending}
      disabled={pending}
      className={`group relative flex h-full w-full flex-col rounded-2xl border border-[#c4c6cf] p-6 text-left transition-all hover:-translate-y-1 hover:shadow-card disabled:cursor-wait disabled:transform-none ${
        highlight ? "bg-[#e5eeff]" : "bg-[#f8f9ff]"
      }`}
    >
      {children}
      {pending && (
        <span
          role="status"
          className={`absolute inset-0 flex items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-[#002147] ${
            highlight ? "bg-[#e5eeff]/95" : "bg-[#f8f9ff]/95"
          }`}
        >
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Opening workspace…
        </span>
      )}
    </button>
  );
}
