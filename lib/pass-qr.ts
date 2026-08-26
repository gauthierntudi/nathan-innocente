import { createHmac, timingSafeEqual } from "node:crypto";

import { getAppBaseUrl } from "@/lib/pass-access-urls";

/** Durée de validité du QR pass (anti-partage par capture). */
export const PASS_QR_TTL_SECONDS = 30 * 60;

/** Marge horloge (secondes) pour le staff / appareils. */
export const PASS_QR_CLOCK_SKEW_SECONDS = 90;

export type PassQrParts = {
  token: string;
  exp: number;
  sig: string;
};

export type PassQrVerifyResult =
  | { ok: true; token: string; exp: number }
  | { ok: false; message: string };

function getPassQrSecret() {
  return (
    process.env.PASS_QR_SECRET?.trim() ||
    process.env.CHECKIN_SYNC_KEY?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    ""
  );
}

export function isPassQrSecretConfigured() {
  return getPassQrSecret().length > 0;
}

export function signPassQr(token: string, exp: number, secret = getPassQrSecret()) {
  if (!secret) {
    throw new Error("Secret QR manquant (PASS_QR_SECRET ou CHECKIN_SYNC_KEY).");
  }
  return createHmac("sha256", secret)
    .update(`${token}.${exp}`)
    .digest("base64url");
}

export function mintPassQr(guestToken: string, nowMs = Date.now()): PassQrParts & {
  expiresAt: string;
  ttlSeconds: number;
} {
  const token = guestToken.trim();
  const exp = Math.floor(nowMs / 1000) + PASS_QR_TTL_SECONDS;
  const sig = signPassQr(token, exp);
  return {
    token,
    exp,
    sig,
    expiresAt: new Date(exp * 1000).toISOString(),
    ttlSeconds: PASS_QR_TTL_SECONDS,
  };
}

/** URL encodée dans le QR (signée, TTL 30 min). */
export function buildSignedCheckInUrl(guestToken: string, nowMs = Date.now()) {
  const minted = mintPassQr(guestToken, nowMs);
  const params = new URLSearchParams({
    token: minted.token,
    exp: String(minted.exp),
    sig: minted.sig,
  });
  return {
    url: `${getAppBaseUrl()}/check-in?${params.toString()}`,
    expiresAt: minted.expiresAt,
    ttlSeconds: minted.ttlSeconds,
    exp: minted.exp,
  };
}

function safeEqualString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function verifyPassQrParts(
  input: {
    token?: string | null;
    exp?: string | number | null;
    sig?: string | null;
  },
  nowMs = Date.now(),
): PassQrVerifyResult {
  const token = input.token?.toString().trim() ?? "";
  const sig = input.sig?.toString().trim() ?? "";
  const expRaw = input.exp;

  if (!token) {
    return { ok: false, message: "Pass invalide." };
  }

  if (!sig || expRaw == null || expRaw === "") {
    return {
      ok: false,
      message: "QR non signé ou expiré — rouvrez votre pass d'accès.",
    };
  }

  const exp =
    typeof expRaw === "number" ? expRaw : Number.parseInt(String(expRaw), 10);
  if (!Number.isFinite(exp) || exp <= 0) {
    return { ok: false, message: "QR invalide." };
  }

  const secret = getPassQrSecret();
  if (!secret) {
    return { ok: false, message: "Configuration serveur QR manquante." };
  }

  let expected: string;
  try {
    expected = signPassQr(token, exp, secret);
  } catch {
    return { ok: false, message: "Configuration serveur QR manquante." };
  }

  if (!safeEqualString(sig, expected)) {
    return { ok: false, message: "QR invalide." };
  }

  const nowSec = Math.floor(nowMs / 1000);
  if (nowSec > exp + PASS_QR_CLOCK_SKEW_SECONDS) {
    return {
      ok: false,
      message: "QR expiré — rouvrez votre pass d'accès pour en générer un nouveau.",
    };
  }

  // Refuse un exp anormalement lointain (au-delà TTL + marge).
  if (exp > nowSec + PASS_QR_TTL_SECONDS + PASS_QR_CLOCK_SKEW_SECONDS) {
    return { ok: false, message: "QR invalide." };
  }

  return { ok: true, token, exp };
}

/** Lit token/exp/sig depuis une URL check-in ou un objet query. */
export function parsePassQrFromSearchParams(
  params: URLSearchParams | Record<string, string | undefined>,
): { token: string; exp: string; sig: string } {
  if (params instanceof URLSearchParams) {
    return {
      token: params.get("token")?.trim() ?? "",
      exp: params.get("exp")?.trim() ?? "",
      sig: params.get("sig")?.trim() ?? "",
    };
  }
  return {
    token: params.token?.trim() ?? "",
    exp: params.exp?.trim() ?? "",
    sig: params.sig?.trim() ?? "",
  };
}
