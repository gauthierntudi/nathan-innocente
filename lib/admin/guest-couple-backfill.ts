import { inferGenreFromNumGuests } from "@/lib/admin/guest-create";
import {
  isCoupleGuestName,
  resolveNumGuestsForGuestName,
} from "@/lib/admin/guest-couple";
import { prisma } from "@/lib/prisma";

export type CoupleSeatsBackfillResult = {
  guestsScanned: number;
  coupleGuests: number;
  guestsUpdated: number;
  ceremonyRowsUpdated: number;
};

/**
 * Applique la règle couple (min. 2 convives) aux invités déjà en base
 * et à toutes leurs affectations de cérémonie.
 */
export async function backfillCoupleCeremonySeats(): Promise<CoupleSeatsBackfillResult> {
  const guests = await prisma.guest.findMany({
    select: {
      id: true,
      name: true,
      numGuests: true,
      genre: true,
      confirmedGuests: true,
      guestCeremonies: {
        select: {
          id: true,
          numGuests: true,
          confirmedGuests: true,
        },
      },
    },
  });

  let coupleGuests = 0;
  let guestsUpdated = 0;
  let ceremonyRowsUpdated = 0;

  for (const guest of guests) {
    if (!isCoupleGuestName(guest.name)) continue;
    coupleGuests += 1;

    const nextNumGuests = resolveNumGuestsForGuestName(
      guest.name,
      guest.numGuests,
    );
    const guestNeedsUpdate = nextNumGuests !== guest.numGuests;
    const nextGenre =
      guestNeedsUpdate &&
      (guest.genre === "Cher(e)" || !guest.genre?.trim())
        ? inferGenreFromNumGuests(nextNumGuests)
        : guest.genre;

    if (guestNeedsUpdate || nextGenre !== guest.genre) {
      await prisma.guest.update({
        where: { id: guest.id },
        data: {
          numGuests: nextNumGuests,
          confirmedGuests: Math.min(guest.confirmedGuests, nextNumGuests),
          genre: nextGenre,
        },
      });
      guestsUpdated += 1;
    }

    for (const assignment of guest.guestCeremonies) {
      const nextSeats = resolveNumGuestsForGuestName(
        guest.name,
        assignment.numGuests,
      );
      if (nextSeats === assignment.numGuests) continue;

      await prisma.guestCeremony.update({
        where: { id: assignment.id },
        data: {
          numGuests: nextSeats,
          confirmedGuests: Math.min(assignment.confirmedGuests, nextSeats),
        },
      });
      ceremonyRowsUpdated += 1;
    }
  }

  return {
    guestsScanned: guests.length,
    coupleGuests,
    guestsUpdated,
    ceremonyRowsUpdated,
  };
}
