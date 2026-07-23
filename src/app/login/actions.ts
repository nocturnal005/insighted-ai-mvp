"use server";

import { redirect } from "next/navigation";
import { DEMO_MODE, clearSession, demoUsers, setSession } from "@/lib/session";

/**
 * Sign in as a demo role and RETURN the post-login destination. It deliberately does not
 * `redirect()`: the client calls this and then navigates with router.push, so Next shows the
 * (app)/loading.tsx skeleton immediately instead of the browser blocking on a server redirect
 * until the dashboard has finished its (Neon-backed) render. Only same-origin relative paths
 * are honoured; anything else falls back to the dashboard.
 */
export async function enterWorkspace(userId: string, next?: string): Promise<string> {
  if (!DEMO_MODE) throw new Error("Demo sign-in is disabled");

  if (!demoUsers().some((user) => user.id === userId)) {
    throw new Error("Invalid workspace profile");
  }
  await setSession(userId);

  const target = (next ?? "").trim();
  return target.startsWith("/") && !target.startsWith("//") ? target : "/dashboard";
}

export async function signOut() {
  await clearSession();
  redirect("/login");
}
