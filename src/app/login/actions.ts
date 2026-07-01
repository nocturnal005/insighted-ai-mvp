"use server";

import { redirect } from "next/navigation";
import { setSession, clearSession } from "@/lib/session";

export async function signInAs(formData: FormData) {
  const userId = String(formData.get("userId") || "");
  if (!userId) return;
  setSession(userId);

  // Optional post-login destination (e.g. the Audit & Compliance workspace card).
  // Only same-origin relative paths are honoured, otherwise fall back to the dashboard.
  const next = String(formData.get("next") || "");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  redirect(safeNext);
}

export async function signOut() {
  clearSession();
  redirect("/login");
}
