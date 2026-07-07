import { getCeremonyGuestContent, type GuestCeremonyDetails } from "@/lib/ceremony-content";
import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import { prisma } from "@/lib/prisma";

export type GuestCeremonyView = GuestCeremonyDetails & {
  tableName: string | null;
  availability: boolean | null;
  confirmedGuests: number;
};

export function hasRespondedToAllCeremonies(
  ceremonies: Array<{ availability: boolean | null }>,
) {
  return ceremonies.length > 0 && ceremonies.every((ceremony) => ceremony.availability !== null);
}

export async function getGuestCeremoniesForGuest(
  guestId: string,
): Promise<GuestCeremonyView[]> {
  const assignments = await prisma.guestCeremony.findMany({
    where: { guestId },
    include: {
      ceremony: true,
      table: true,
    },
    orderBy: { ceremony: { sortOrder: "asc" } },
  });

  return assignments
    .filter((assignment): assignment is typeof assignment & { ceremonyId: CeremonyId } =>
      isCeremonyId(assignment.ceremonyId),
    )
    .map((assignment) => {
      const content = getCeremonyGuestContent(
        assignment.ceremonyId,
        assignment.ceremony.name,
      );

      return {
        ...content,
        tableName: assignment.table?.name ?? null,
        availability: assignment.availability,
        confirmedGuests: assignment.confirmedGuests,
      };
    });
}
