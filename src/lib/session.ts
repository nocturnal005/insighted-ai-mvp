import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, findUser } from "@/lib/store";
import type { User } from "@/lib/types";

/**
 * Cookie-based demo session. Stores the selected user's id in an httpOnly cookie.
 * (A real deployment swaps this for Supabase Auth / OIDC — the rest of the app only
 * depends on `getCurrentUser()` returning a User, so nothing else changes.)
 */
const COOKIE = "insighted_session";
export const DEMO_MODE = process.env.DEMO_MODE !== "false";

export function setSession(userId: string): void {
  cookies().set(COOKIE, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export function clearSession(): void {
  cookies().delete(COOKIE);
}

export function getCurrentUser(): User | null {
  const userId = cookies().get(COOKIE)?.value;
  if (!userId) return null;
  return findUser(userId) ?? null;
}

/** Require auth in a Server Component / Action; redirect to /login otherwise. */
export function requireUser(): User {
  const user = getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function demoUsers(): User[] {
  return db.users;
}
