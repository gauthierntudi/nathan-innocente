import type { Guest } from "@prisma/client";

import { getGuestCeremoniesForGuest } from "@/lib/guest-ceremonies";
import { getConfirmedCeremonies } from "@/lib/guest-rsvp-flow";
import { buildCheckInUrl } from "@/lib/pass-access-urls";

export type PassAccessCeremony = {
  id: string;
  name: string;
  tableName: string | null;
  numGuests: number;
  availability: boolean | null;
};

export type PassAccessPayload = {
  guestName: string;
  guestGenre: string;
  numGuests: number;
  checkInUrl: string;
  /** Toutes les cérémonies auxquelles l'invité est affecté. */
  ceremonies: PassAccessCeremony[];
  /** Cérémonies affectées avec présence confirmée (availability === true). */
  confirmedCeremonies: PassAccessCeremony[];
  /** Cérémonies affectées sans réponse RSVP. */
  pendingCeremonies: PassAccessCeremony[];
  /** Afficher le bouton de confirmation sur l'écran pass. */
  showConfirmButton: boolean;
  confirmButtonLabel: string | null;
  /** Valide tant qu'il reste au moins une cérémonie affectée confirmée. */
  valid: boolean;
  invalidReason: string | null;
};

function mapCeremony(ceremony: Awaited<ReturnType<typeof getGuestCeremoniesForGuest>>[number]): PassAccessCeremony {
  return {
    id: ceremony.id,
    name: ceremony.name,
    tableName: ceremony.tableName,
    numGuests: ceremony.numGuests,
    availability: ceremony.availability,
  };
}

/** Cérémonies affectées sans réponse RSVP. */
export function getPendingCeremonies(ceremonies: PassAccessCeremony[]) {
  return ceremonies.filter((ceremony) => ceremony.availability === null);
}

export function getPassConfirmButtonLabel(pendingCeremonies: PassAccessCeremony[]) {
  if (pendingCeremonies.length === 0) return null;
  if (pendingCeremonies.length === 1) {
    return `Confirmer : ${pendingCeremonies[0].name}`;
  }
  if (pendingCeremonies.length === 2) {
    return "Confirmer mes 2 cérémonies restantes";
  }
  return `Confirmer mes cérémonies (${pendingCeremonies.length} restantes)`;
}

/** Pass valide ↔ au moins une cérémonie affectée avec RSVP « oui ». */
export function isPassValid(ceremonies: PassAccessCeremony[]) {
  return getConfirmedCeremonies(ceremonies).length > 0;
}

export function getPassInvalidReason(ceremonies: PassAccessCeremony[]): string | null {
  if (ceremonies.length === 0) {
    return "Aucune cérémonie ne vous est assignée pour le moment.";
  }
  if (ceremonies.every((ceremony) => ceremony.availability === false)) {
    return "Vous avez décliné toutes vos cérémonies — le pass n'est plus valide.";
  }
  if (!ceremonies.some((ceremony) => ceremony.availability === true)) {
    return "Confirmez votre présence à au moins une cérémonie pour activer le pass.";
  }
  return null;
}

export async function buildPassAccessPayload(
  guest: Guest,
): Promise<PassAccessPayload> {
  const assignments = await getGuestCeremoniesForGuest(guest.id);
  const ceremonies = assignments.map(mapCeremony);
  const confirmedCeremonies = getConfirmedCeremonies(ceremonies);
  const pendingCeremonies = getPendingCeremonies(ceremonies);
  const valid = isPassValid(ceremonies);
  const confirmButtonLabel = getPassConfirmButtonLabel(pendingCeremonies);

  return {
    guestName: guest.name,
    guestGenre: guest.genre,
    numGuests: guest.numGuests,
    checkInUrl: buildCheckInUrl(guest.token),
    ceremonies,
    confirmedCeremonies,
    pendingCeremonies,
    showConfirmButton: pendingCeremonies.length > 0,
    confirmButtonLabel,
    valid,
    invalidReason: valid ? null : getPassInvalidReason(ceremonies),
  };
}
