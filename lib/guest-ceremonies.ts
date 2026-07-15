import { getCeremonyGuestContent, type GuestCeremonyDetails } from "@/lib/ceremony-content";
import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import { prisma } from "@/lib/prisma";

async function getCeremonyDressCodeMap(guestId: string) {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; dress_code_downloaded_at: Date | null }>
  >`
    SELECT id, dress_code_downloaded_at
    FROM guest_ceremonies
    WHERE guest_id = ${guestId}
  `;

  return new Map(
    rows.map((row) => [row.id, row.dress_code_downloaded_at?.toISOString() ?? null]),
  );
}

export type GuestCeremonyView = GuestCeremonyDetails & {
  tableName: string | null;
  numGuests: number;
  availability: boolean | null;
  confirmedGuests: number;
  dressCodeDownloadedAt: string | null;
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

  const dressCodeByAssignmentId = await getCeremonyDressCodeMap(guestId);

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
        numGuests: Math.max(1, assignment.numGuests || 1),
        availability: assignment.availability,
        confirmedGuests: assignment.confirmedGuests,
        dressCodeDownloadedAt: dressCodeByAssignmentId.get(assignment.id) ?? null,
      };
    });
}
