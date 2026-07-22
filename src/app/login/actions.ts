"use server";

import { redirect } from "next/navigation";
import { DEMO_MODE, clearSession, demoUsers, setSession } from "@/lib/session";

export async function signInAs(formData: FormData) {
  if (!DEMO_MODE) throw new Error("Demo sign-in is disabled");

  const userId = String(formData.get("userId") || "");
  if (!demoUsers().some((user) => user.id === userId)) {
    throw new Error("Invalid workspace profile");
  }
  await setSession(userId);

  // Optional post-login destination (e.g. the Audit & Compliance workspace card).
  // Only same-origin relative paths are honoured, otherwise fall back to the dashboard.
  const next = String(formData.get("next") || "");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  redirect(safeNext);
}

export async function signOut() {
  await clearSession();
  redirect("/login");
}
