import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "admin_logged_in";
const ADMIN_SESSION_MAX_AGE = 12 * 60 * 60;

export async function isAdminAuthenticated() {
  const store = await cookies();
  return store.get(ADMIN_COOKIE)?.value === "1";
}

export async function setAdminSession() {
  const store = await cookies();
  store.set(ADMIN_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
}

export async function clearAdminSession() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

export function verifyAdminPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected || !password) return false;

  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export async function requireAdmin() {
  if (!(await isAdminAuthenticated())) {
    throw new Error("UNAUTHORIZED");
  }
}
