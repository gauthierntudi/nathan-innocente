import type { Guest } from "@prisma/client";

import { getGuestCeremoniesForGuest } from "@/lib/guest-ceremonies";
import {
  backfillSingleCeremonyDressCode,
  getGuestEndReason,
  shouldShowGuestEndScreen,
} from "@/lib/guests";

export async function buildGuestSessionPayload(guest: Guest) {
  await backfillSingleCeremonyDressCode(guest.id);
  const ceremonies = await getGuestCeremoniesForGuest(guest.id);
  const alreadySubmitted = await shouldShowGuestEndScreen(guest.id);

  return {
    authenticated: true as const,
    alreadySubmitted,
    endReason: alreadySubmitted ? await getGuestEndReason(guest.id) : null,
    dressCodeDownloaded:
      guest.dressCodeDownloadedAt !== null ||
      ceremonies.some((ceremony) => ceremony.dressCodeDownloadedAt !== null),
    numGuests: guest.numGuests,
    ceremonies,
  };
}
