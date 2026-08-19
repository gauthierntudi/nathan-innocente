import { CEREMONY_DEFINITIONS, isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import { sendAvailabilityWhatsApp } from "@/lib/twilio";
import type { Guest, GuestCeremony } from "@prisma/client";

type GuestWithCeremonies = Guest & {
  guestCeremonies: GuestCeremony[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function confirmedCeremonyIds(guest: GuestWithCeremonies): CeremonyId[] {
  const confirmed = new Set<CeremonyId>();
  for (const assignment of guest.guestCeremonies) {
    if (assignment.availability !== true) continue;
    if (!isCeremonyId(assignment.ceremonyId)) continue;
    confirmed.add(assignment.ceremonyId);
  }
  return CEREMONY_DEFINITIONS.map((item) => item.id).filter((id) =>
    confirmed.has(id),
  );
}

export async function sendGuestConfirmationMessages(
  guest: GuestWithCeremonies,
) {
  const honorGuest = guest.guestType === "honor";
  const ceremonyIds = confirmedCeremonyIds(guest);

  if (ceremonyIds.length === 0) {
    if (guest.availability !== true) {
      return {
        ok: false as const,
        sent: 0,
        failed: 0,
        ceremonyIds: [] as CeremonyId[],
        message: "Aucune cérémonie confirmée (disponible)",
      };
    }

    const result = await sendAvailabilityWhatsApp({
      phone: guest.phone,
      name: guest.name,
      availability: true,
      honorGuest,
    });

    return {
      ok: result.ok,
      sent: result.ok ? 1 : 0,
      failed: result.ok ? 0 : 1,
      ceremonyIds: [] as CeremonyId[],
      message: result.message,
    };
  }

  let sent = 0;
  let failed = 0;
  let lastError = "";

  for (let index = 0; index < ceremonyIds.length; index += 1) {
    const ceremonyId = ceremonyIds[index];
    const result = await sendAvailabilityWhatsApp({
      phone: guest.phone,
      name: guest.name,
      availability: true,
      ceremonyId,
      honorGuest,
    });

    if (result.ok) sent += 1;
    else {
      failed += 1;
      lastError = result.message ?? lastError;
    }

    if (index < ceremonyIds.length - 1) {
      await sleep(250);
    }
  }

  return {
    ok: failed === 0 && sent > 0,
    sent,
    failed,
    ceremonyIds,
    message: lastError || undefined,
  };
}
