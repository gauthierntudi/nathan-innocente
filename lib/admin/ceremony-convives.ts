import {
  CEREMONY_DEFINITIONS,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";
import type { AdminGuest } from "@/lib/admin/types";

export type CeremonyConvivesStats = {
  ceremonyId: CeremonyId;
  name: string;
  sortOrder: number;
  invitations: number;
  convives: number;
  confirmedSeats: number;
  yes: number;
  no: number;
  pending: number;
};

export function computeCeremonyConvivesStats(
  guests: AdminGuest[],
): CeremonyConvivesStats[] {
  const byId = new Map<
    CeremonyId,
    {
      invitations: number;
      convives: number;
      confirmedSeats: number;
      yes: number;
      no: number;
      pending: number;
    }
  >();

  for (const def of CEREMONY_DEFINITIONS) {
    byId.set(def.id, {
      invitations: 0,
      convives: 0,
      confirmedSeats: 0,
      yes: 0,
      no: 0,
      pending: 0,
    });
  }

  for (const guest of guests) {
    for (const status of guest.ceremonyStatuses ?? []) {
      const bucket = byId.get(status.ceremonyId);
      if (!bucket) continue;

      bucket.invitations += 1;
      bucket.convives += Math.max(0, status.numGuests ?? 0);

      if (status.availability === true) {
        bucket.yes += 1;
        bucket.confirmedSeats += Math.max(0, status.confirmedGuests ?? 0);
      } else if (status.availability === false) {
        bucket.no += 1;
      } else {
        bucket.pending += 1;
      }
    }
  }

  return CEREMONY_DEFINITIONS.map((def) => {
    const stats = byId.get(def.id)!;
    return {
      ceremonyId: def.id,
      name: def.name,
      sortOrder: def.sortOrder,
      ...stats,
    };
  });
}
