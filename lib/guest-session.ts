import type { Guest } from "@prisma/client";

import { getGuestCeremoniesForGuest } from "@/lib/guest-ceremonies";
import { guestIsHonorGuest } from "@/lib/guest-honor";
import {
  backfillSingleCeremonyDressCode,
  getGuestEndReason,
  shouldShowGuestEndScreen,
} from "@/lib/guests";
import { hasAnsweredAllCeremonyRsvps, hasCompletedAllCeremonySteps } from "@/lib/guest-rsvp-flow";

/** Écran « Invitation à venir » (pas encore de table) — activé manuellement via .env */
export function isInvitationWaitingEnabled() {
  const value = process.env.INVITATION_WAITING_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1";
}

export async function buildGuestSessionPayload(guest: Guest) {
  await backfillSingleCeremonyDressCode(guest.id);
  const allCeremonies = await getGuestCeremoniesForGuest(guest.id);
  const tableCeremonies = allCeremonies.filter((ceremony) => ceremony.hasTable);
  const hasTableInvitation = tableCeremonies.length > 0;

  const dressCodeJourneyComplete =
    allCeremonies.length > 0
      ? hasCompletedAllCeremonySteps(allCeremonies)
      : await shouldShowGuestEndScreen(guest.id);

  const invitationJourneyComplete =
    hasTableInvitation && hasAnsweredAllCeremonyRsvps(tableCeremonies);

  const alreadySubmitted = hasTableInvitation
    ? invitationJourneyComplete
    : dressCodeJourneyComplete;

  const isHonorGuest = await guestIsHonorGuest(guest.id);
  const endReason = alreadySubmitted ? await getGuestEndReason(guest.id) : null;

  return {
    authenticated: true as const,
    guestName: guest.name,
    guestGenre: guest.genre,
    hasTableInvitation,
    dressCodeJourneyComplete,
    invitationWaitingEnabled: isInvitationWaitingEnabled(),
    isHonorGuest,
    alreadySubmitted,
    endReason,
    dressCodeDownloaded:
      guest.dressCodeDownloadedAt !== null ||
      allCeremonies.some((ceremony) => ceremony.dressCodeDownloadedAt !== null),
    numGuests: guest.numGuests,
    /** Cérémonies avec table — parcours invitation (enveloppes). */
    ceremonies: tableCeremonies,
    /** Toutes les cérémonies assignées — parcours dress code. */
    dressCodeCeremonies: allCeremonies,
  };
}
