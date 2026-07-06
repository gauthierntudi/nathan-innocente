import { jsonError, jsonOk } from "@/lib/api-response";
import { findGuestBySession, hasSubmitted } from "@/lib/guests";
import { getSessionCookies } from "@/lib/session";

export async function POST() {
  const { phone, deviceId } = await getSessionCookies();

  if (!phone && !deviceId) {
    return jsonError("Session expirée");
  }

  const guest = await findGuestBySession(phone, deviceId);

  if (!guest) {
    return jsonError("Utilisateur non trouvé");
  }

  return jsonOk({ alreadySubmitted: hasSubmitted(guest) });
}
