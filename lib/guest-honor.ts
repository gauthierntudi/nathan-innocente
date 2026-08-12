import { prisma } from "@/lib/prisma";
import type { CeremonyId } from "@/lib/admin/ceremony-types";

/**
 * Invité d'honneur = champ `guestType === "honor"` (défini en admin).
 * `ceremonyId` est ignoré : le type est global à l'invité.
 */
export async function guestIsHonorGuest(
  guestId: string,
  _ceremonyId?: CeremonyId | null,
) {
  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: { guestType: true },
  });
  return guest?.guestType === "honor";
}
