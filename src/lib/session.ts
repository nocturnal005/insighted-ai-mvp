import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, findUser } from "@/lib/store";
import type { User } from "@/lib/types";

/**
 * Cookie-based demo session. Stores the selected user's id in an httpOnly cookie.
 *
 * ⚠️ THIS IS THE SINGLE AUTHENTICATION BOUNDARY. It is a demo identity picker, NOT
 * production-grade auth — there is no password, MFA, or identity-provider verification.
 * Before any pilot with real pupil data, replace the body of `setSession` / `getCurrentUser`
 * with a real provider (Supabase Auth / OIDC). Everything else in the app depends only on
 * `getCurrentUser()` returning a `User`, so no other file needs to change.
 */
const COOKIE = "insighted_session";

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
