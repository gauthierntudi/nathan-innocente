import { prisma } from "@/lib/prisma";
import {
  computeStats,
  serializeGuest,
  type AdminGuest,
  type AdminStats,
} from "@/lib/admin/types";

export async function getAdminDashboardData(): Promise<{
  guests: AdminGuest[];
  stats: AdminStats;
}> {
  const guests = await prisma.guest.findMany({
    orderBy: { name: "asc" },
    include: {
      guestCeremonies: {
        select: {
          ceremonyId: true,
          availability: true,
          confirmedGuests: true,
          dressCodeDownloadedAt: true,
        },
      },
    },
  });

  const serialized = guests.map(serializeGuest);
  return {
    guests: serialized,
    stats: computeStats(serialized),
  };
}
