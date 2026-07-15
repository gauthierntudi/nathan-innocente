import type { CeremonyId } from "@/lib/admin/ceremony-types";
import { addGuestCeremonies, syncGuestCeremonies } from "@/lib/admin/ceremonies";
import { serializeGuest } from "@/lib/admin/types";
import { syncGuestAvailabilityAggregate } from "@/lib/guests";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

const guestCeremonyInclude = {
  guestCeremonies: {
    select: {
      ceremonyId: true,
      availability: true,
      confirmedGuests: true,
      dressCodeDownloadedAt: true,
    },
  },
} as const;

export async function loadSerializedAdminGuest(guestId: string) {
  const guest = await prisma.guest.findUniqueOrThrow({
    where: { id: guestId },
    include: guestCeremonyInclude,
  });
  return serializeGuest(guest);
}

/** Invité existant : normalise le téléphone et ajoute les cérémonies cochées. */
export async function assignCeremoniesToExistingGuest(input: {
  guestId: string;
  phone: string;
  ceremonyIds: CeremonyId[];
  guestName: string;
}) {
  const phone = normalizePhone(input.phone);
  const ceremonyCountBefore = await prisma.guestCeremony.count({
    where: { guestId: input.guestId },
  });

  await prisma.guest.update({
    where: { id: input.guestId },
    data: { phone },
  });

  if (input.ceremonyIds.length > 0) {
    await addGuestCeremonies(input.guestId, input.ceremonyIds);
    await syncGuestAvailabilityAggregate(input.guestId);
  }

  const message =
    input.ceremonyIds.length > 0
      ? ceremonyCountBefore === 0
        ? `Invité « ${input.guestName} » déjà en base (sans cérémonie) — affecté aux cérémonies sélectionnées`
        : `Invité « ${input.guestName} » déjà en base — cérémonies mises à jour`
      : `Invité « ${input.guestName} » déjà en base (aucun doublon créé)`;

  return {
    message,
    guest: await loadSerializedAdminGuest(input.guestId),
  };
}

export async function createGuestWithCeremonies(input: {
  name: string;
  phone: string;
  numGuests: number;
  genre: string;
  token: string;
  ceremonyIds: CeremonyId[];
}) {
  const phone = normalizePhone(input.phone);

  const guest = await prisma.guest.create({
    data: {
      name: input.name,
      phone,
      numGuests: input.numGuests,
      genre: input.genre,
      token: input.token,
    },
  });

  if (input.ceremonyIds.length > 0) {
    await syncGuestCeremonies(guest.id, input.ceremonyIds);
    await syncGuestAvailabilityAggregate(guest.id);
  }

  return {
    message: `Invité « ${guest.name} » ajouté`,
    guest: await loadSerializedAdminGuest(guest.id),
  };
}
