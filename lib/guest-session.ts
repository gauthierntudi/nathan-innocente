import type { Guest } from "@prisma/client";

import { getGuestCeremoniesForGuest } from "@/lib/guest-ceremonies";
import { hasSubmitted } from "@/lib/guests";

export async function buildGuestSessionPayload(guest: Guest) {
  const ceremonies = await getGuestCeremoniesForGuest(guest.id);

  return {
    authenticated: true as const,
    alreadySubmitted: hasSubmitted(guest),
    numGuests: guest.numGuests,
    ceremonies,
  };
}
