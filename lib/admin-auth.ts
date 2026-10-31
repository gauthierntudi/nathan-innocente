import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "admin_logged_in";
const ADMIN_SESSION_MAX_AGE = 12 * 60 * 60;

function adminSessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    ""
  );
}

function signAdminSession(expiresAt: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`admin-session:${expiresAt}`)
    .digest("base64url");
}

/** Jeton `expiration.signature`, valable ADMIN_SESSION_MAX_AGE secondes. */
export function createAdminSessionToken() {
  const secret = adminSessionSecret();
  if (!secret) throw new Error("ADMIN_PASSWORD manquant.");

  const expiresAt = String(Date.now() + ADMIN_SESSION_MAX_AGE * 1000);
  return `${expiresAt}.${signAdminSession(expiresAt, secret)}`;
}

export function verifyAdminSessionToken(token: string | undefined) {
  const secret = adminSessionSecret();
  if (!secret || !token) return false;

  const [expiresAt, signature, ...rest] = token.split(".");
  if (!expiresAt || !signature || rest.length > 0) return false;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) <= Date.now()) return false;

  const a = Buffer.from(signature);
  const b = Buffer.from(signAdminSession(expiresAt, secret));
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export async function isAdminAuthenticated() {
  const store = await cookies();
  return verifyAdminSessionToken(store.get(ADMIN_COOKIE)?.value);
}

export async function setAdminSession() {
  const store = await cookies();
  store.set(ADMIN_COOKIE, createAdminSessionToken(), {
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
