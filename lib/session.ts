import { cookies } from "next/headers";

export const COOKIE_AUTH_USER = "std_auth_user";
export const COOKIE_DEVICE_ID = "device_id";

export const AUTH_COOKIE_MAX_AGE = 5 * 60;
export const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export async function getSessionCookies() {
  const store = await cookies();
  return {
    phone: store.get(COOKIE_AUTH_USER)?.value ?? "",
    deviceId: store.get(COOKIE_DEVICE_ID)?.value ?? "",
  };
}

export function isSecureCookieContext() {
  return process.env.NODE_ENV === "production";
}
