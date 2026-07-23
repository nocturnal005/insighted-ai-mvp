"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { enterWorkspace } from "./actions";

/**
 * Workspace entry card. Signs in via a server action that only sets the session cookie, then
 * navigates client-side with router.push. Because that is a client navigation (not a server
 * `redirect()`), Next renders the (app)/loading.tsx skeleton instantly — so the click gets an
 * immediate response instead of waiting for the dashboard's data (a Neon read) to load.
 */
export function WorkspaceCard({
  userId,
  next,
  ariaLabel,
  highlight,
  children,
}: {
  userId: string;
  next?: string;
  ariaLabel: string;
  highlight: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleEnter() {
    startTransition(async () => {
      try {
        const destination = await enterWorkspace(userId, next);
        router.push(destination);
      } catch {
        // Sign-in failed (e.g. demo mode disabled); leave the card clickable to retry.
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleEnter}
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
