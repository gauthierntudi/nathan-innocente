import type { Guest } from "@prisma/client";

import { getGuestCeremoniesForGuest } from "@/lib/guest-ceremonies";
import { getGuestEndReason, shouldShowGuestEndScreen } from "@/lib/guests";

export async function buildGuestSessionPayload(guest: Guest) {
  const ceremonies = await getGuestCeremoniesForGuest(guest.id);
  const alreadySubmitted = await shouldShowGuestEndScreen(guest.id);

  return {
    authenticated: true as const,
    alreadySubmitted,
    endReason: alreadySubmitted ? await getGuestEndReason(guest.id) : null,
    numGuests: guest.numGuests,
    ceremonies,
  };
}
