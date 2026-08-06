import { prisma } from "@/lib/prisma";
import {
  computeStats,
  serializeGuest,
  type AdminGuest,
  type AdminStats,
} from "@/lib/admin/types";

function isTransientDbError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.includes("Can't reach database server");
}

async function loadGuestsWithRetry() {
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.guest.findMany({
        orderBy: { name: "asc" },
        include: {
          guestCeremonies: {
            select: {
              ceremonyId: true,
              tableId: true,
              availability: true,
              confirmedGuests: true,
              numGuests: true,
              dressCodeDownloadedAt: true,
            },
          },
        },
      });
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  throw lastError;
}

export async function getAdminDashboardData(): Promise<{
  guests: AdminGuest[];
  stats: AdminStats;
}> {
  const guests = await loadGuestsWithRetry();

  const serialized = guests.map(serializeGuest);
  return {
    guests: serialized,
    stats: computeStats(serialized),
  };
}
