import { jsonError, jsonOk } from "@/lib/api-response";
import { findGuestBySession } from "@/lib/guests";
import { buildPassAccessPayload } from "@/lib/pass-access";
import { getSessionCookies } from "@/lib/session";

export async function GET() {
  try {
    const { phone, deviceId } = await getSessionCookies();

    if (!phone && !deviceId) {
      return jsonError("Non authentifié", 401);
    }

    const guest = await findGuestBySession(phone, deviceId);
    if (!guest) {
      return jsonError("Non authentifié", 401);
    }

    const payload = await buildPassAccessPayload(guest);
    return jsonOk(payload);
  } catch (error) {
    console.error("GET /api/auth/pass-access", error);
    return jsonError(
      error instanceof Error
        ? error.message
        : "Une erreur technique est survenue.",
      500,
    );
  }
}
