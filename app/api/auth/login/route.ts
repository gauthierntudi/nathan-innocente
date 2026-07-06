import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

import { jsonError, jsonOk } from "@/lib/api-response";
import {
  bindDeviceIfEmpty,
  findGuestByPhone,
} from "@/lib/guests";
import { buildGuestSessionPayload } from "@/lib/guest-session";
import { normalizePhone } from "@/lib/phone";
import {
  AUTH_COOKIE_MAX_AGE,
  COOKIE_AUTH_USER,
  COOKIE_DEVICE_ID,
  DEVICE_COOKIE_MAX_AGE,
  isSecureCookieContext,
} from "@/lib/session";

type LoginBody = {
  phone?: string;
  urlToken?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBody;
    const phone = normalizePhone(body.phone ?? "");
    const urlToken = body.urlToken?.trim() ?? "";

    if (!phone) {
      return jsonError("Numéro de téléphone requis.");
    }

    const cookieStore = await cookies();
    let deviceId = cookieStore.get(COOKIE_DEVICE_ID)?.value;

    if (!deviceId) {
      deviceId = randomBytes(16).toString("hex");
      cookieStore.set(COOKIE_DEVICE_ID, deviceId, {
        httpOnly: true,
        secure: isSecureCookieContext(),
        sameSite: "lax",
        path: "/",
        maxAge: DEVICE_COOKIE_MAX_AGE,
      });
    }

    const guest = await findGuestByPhone(phone, urlToken || undefined);

    if (!guest) {
      if (urlToken) {
        return jsonError(
          "Le lien utilisé ne correspond pas à votre numéro. Utilisez votre lien personnel.",
        );
      }
      return jsonError(
        "Désolé, ce numéro de téléphone n'est pas dans la liste des invités.",
      );
    }

    const boundGuest = await bindDeviceIfEmpty(guest, deviceId);

    cookieStore.set(COOKIE_AUTH_USER, phone, {
      httpOnly: true,
      secure: isSecureCookieContext(),
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE,
    });

    const session = await buildGuestSessionPayload(boundGuest);
    return jsonOk(session);
  } catch (error) {
    console.error("POST /api/auth/login", error);
    return jsonError(
      error instanceof Error
        ? error.message
        : "Une erreur technique est survenue.",
      500,
    );
  }
}
