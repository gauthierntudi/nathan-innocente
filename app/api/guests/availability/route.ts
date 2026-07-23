import { jsonError, jsonOk } from "@/lib/api-response";
import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
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

function resolveCeremonyId(
  requestedId: string,
  ceremonies: Array<{ id: CeremonyId; availability: boolean | null }>,
): CeremonyId | null {
  if (isCeremonyId(requestedId) && ceremonies.some((ceremony) => ceremony.id === requestedId)) {
    return requestedId;
  }

  const pendingCeremony = ceremonies.find((ceremony) => ceremony.availability === null);
  if (pendingCeremony) {
    return pendingCeremony.id;
  }

  if (ceremonies.length === 1) {
    return ceremonies[0].id;
  }

  return null;
}

export async function POST(request: Request) {
  try {
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
    const ceremonies = await getGuestCeremoniesForGuest(guest.id);
    let updated = guest;

    if (ceremonies.length > 0) {
      const ceremonyId = resolveCeremonyId(body.ceremonyId?.trim() ?? "", ceremonies);

      if (!ceremonyId) {
        return jsonError("Cérémonie invalide.");
      }

      const ceremony = ceremonies.find((item) => item.id === ceremonyId);
      const maxGuests = Math.max(1, ceremony?.numGuests ?? guest.numGuests);
      const confirmedGuests = Math.max(
        0,
        Math.min(
          maxGuests,
          Number.isFinite(body.confirmedGuests) ? Number(body.confirmedGuests) : 1,
        ),
      );

      updated = await updateCeremonyAvailability(
        guest.id,
        ceremonyId,
        availability,
        confirmedGuests,
      );
    } else {
      const confirmedGuests = Math.max(
        0,
        Math.min(
          Math.max(1, guest.numGuests),
          Number.isFinite(body.confirmedGuests) ? Number(body.confirmedGuests) : 1,
        ),
      );
      updated = await updateGuestAvailability(guest.id, availability, confirmedGuests);
    }

    try {
      await sendAvailabilityWhatsApp({
        phone: updated.phone,
        name: updated.name,
        availability,
      });
    } catch (error) {
      console.error("POST /api/guests/availability twilio", error);
    }

    return jsonOk({});
  } catch (error) {
    console.error("POST /api/guests/availability", error);
    return jsonError(
      error instanceof Error ? error.message : "Erreur lors de l'enregistrement.",
    );
  }
}
