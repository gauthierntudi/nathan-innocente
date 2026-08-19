import { prisma } from "@/lib/prisma";
import {
  computeStats,
  serializeGuest,
  type AdminGuest,
  type AdminStats,
} from "@/lib/admin/types";

function isTransientDbError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  return (
    code === "P1001" ||
    code === "P1002" ||
    code === "P1017" ||
    error.message.includes("Can't reach database server") ||
    error.message.includes("Timed out fetching a new connection") ||
    error.message.includes("Connection terminated") ||
    error.message.includes("Server has closed the connection")
  );
}

async function loadGuestsWithRetry() {
  const maxAttempts = 4;
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
              groupId: true,
              group: {
                select: { name: true },
              },
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
      await prisma.$disconnect().catch(() => undefined);
      const delayMs = 600 * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
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
