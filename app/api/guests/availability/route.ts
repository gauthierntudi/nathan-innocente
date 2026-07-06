import { jsonError, jsonOk } from "@/lib/api-response";
import {
  findGuestBySession,
  updateGuestAvailability,
} from "@/lib/guests";
import { getSessionCookies } from "@/lib/session";
import { sendAvailabilityWhatsApp } from "@/lib/twilio";

type AvailabilityBody = {
  availability?: boolean;
  confirmedGuests?: number;
};

export async function POST(request: Request) {
  const { phone, deviceId } = await getSessionCookies();

  if (!phone && !deviceId) {
    return jsonError("Session expirée. Veuillez recharger la page.");
  }

  const guest = await findGuestBySession(phone, deviceId);

  if (!guest) {
    return jsonError("Utilisateur non trouvé.");
  }

  const body = (await request.json()) as AvailabilityBody;
  const availability = body.availability ?? true;
  const confirmedGuests = Math.max(
    0,
    Math.min(
      guest.numGuests,
      Number.isFinite(body.confirmedGuests) ? Number(body.confirmedGuests) : 1,
    ),
  );

  const updated = await updateGuestAvailability(
    guest.id,
    availability,
    confirmedGuests,
  );

  await sendAvailabilityWhatsApp({
    phone: updated.phone,
    name: updated.name,
    availability: updated.availability ?? false,
  });

  return jsonOk({});
}
