import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, findUser } from "@/lib/store";
import type { User } from "@/lib/types";

/**
 * Cookie-based demo session. Stores the selected user's id in an httpOnly cookie.
 * (A real deployment swaps this for Supabase Auth / OIDC — the rest of the app only
 * depends on `getCurrentUser()` returning a User, so nothing else changes.)
 */
const COOKIE = "braivanta_session";
export const DEMO_MODE = process.env.DEMO_MODE !== "false";

export async function setSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get(COOKIE)?.value;
  if (!userId) return null;
  return findUser(userId) ?? null;
}

/** Require auth in a Server Component / Action; redirect to /login otherwise. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function demoUsers(): User[] {
  return db.users;
}
