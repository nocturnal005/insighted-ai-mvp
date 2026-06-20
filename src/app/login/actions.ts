"use server";

import { redirect } from "next/navigation";
import { setSession, clearSession } from "@/lib/session";

export async function signInAs(formData: FormData) {
  const userId = String(formData.get("userId") || "");
  if (!userId) return;
  setSession(userId);
  redirect("/dashboard");
}

export async function signOut() {
  clearSession();
  redirect("/login");
}
