import { jsonError, jsonOk } from "@/lib/api-response";
import { isCeremonyId } from "@/lib/admin/ceremony-types";
import {
  findGuestBySession,
  updateCeremonyAvailability,
  updateGuestAvailability,
} from "@/lib/guests";
import { getGuestCeremoniesForGuest } from "@/lib/guest-ceremonies";
import { getSessionCookies } from "@/lib/session";
import { sendAvailabilityWhatsApp } from "@/lib/twilio";

type AvailabilityBody = {
  ceremonyId?: string;
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

  const ceremonies = await getGuestCeremoniesForGuest(guest.id);
  let updated = guest;

  if (ceremonies.length > 0) {
    const ceremonyId = body.ceremonyId?.trim() ?? "";

    if (!isCeremonyId(ceremonyId)) {
      return jsonError("Cérémonie invalide.");
    }

    if (!ceremonies.some((ceremony) => ceremony.id === ceremonyId)) {
      return jsonError("Vous n'êtes pas invité à cette cérémonie.");
    }

    updated = await updateCeremonyAvailability(
      guest.id,
      ceremonyId,
      availability,
      confirmedGuests,
    );
  } else {
    updated = await updateGuestAvailability(guest.id, availability, confirmedGuests);
  }

  await sendAvailabilityWhatsApp({
    phone: updated.phone,
    name: updated.name,
    availability: availability,
  });

  return jsonOk({});
}
