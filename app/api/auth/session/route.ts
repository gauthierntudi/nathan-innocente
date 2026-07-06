import { jsonError, jsonOk } from "@/lib/api-response";
import { findGuestBySession } from "@/lib/guests";
import { buildGuestSessionPayload } from "@/lib/guest-session";
import { getSessionCookies } from "@/lib/session";

export async function GET() {
  try {
    const { phone, deviceId } = await getSessionCookies();

    if (!phone && !deviceId) {
      return jsonOk({ authenticated: false });
    }

    const guest = await findGuestBySession(phone, deviceId);

    if (!guest) {
      return jsonOk({ authenticated: false });
    }

    const session = await buildGuestSessionPayload(guest);
    return jsonOk(session);
  } catch (error) {
    console.error("GET /api/auth/session", error);
    return jsonError(
      error instanceof Error
        ? error.message
        : "Une erreur technique est survenue.",
      500,
    );
  }
}
