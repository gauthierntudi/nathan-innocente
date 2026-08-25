import { timingSafeEqual } from "node:crypto";

import { jsonError, jsonOk } from "@/lib/api-response";
import {
  getPassInvalidReason,
  isPassValid,
  type PassAccessCeremony,
} from "@/lib/pass-access";
import { getConfirmedCeremonies } from "@/lib/guest-rsvp-flow";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

function verifyCheckInSyncKey(headerValue: string | null) {
  const provided = headerValue?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const expected =
    process.env.CHECKIN_SYNC_KEY?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    "";

  if (!expected || !provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Catalogue des passes pour l'app staff (mode offline).
 * Auth: Authorization: Bearer <CHECKIN_SYNC_KEY|ADMIN_PASSWORD>
 *
 * Charge les invités + cérémonies en 2 requêtes (évite le pool timeout Prisma).
 */
export async function GET(request: Request) {
  try {
    const auth = request.headers.get("authorization");
    const keyHeader = request.headers.get("x-checkin-key");
    if (!verifyCheckInSyncKey(auth) && !verifyCheckInSyncKey(keyHeader)) {
      return jsonError("Non autorisé", 401);
    }

    const guests = await prisma.guest.findMany({
      where: { phoneFictitious: false },
      orderBy: { name: "asc" },
      select: {
        id: true,
        token: true,
        name: true,
        genre: true,
        numGuests: true,
      },
    });

    const guestIds = guests.map((guest) => guest.id);
    const assignments =
      guestIds.length === 0
        ? []
        : await prisma.guestCeremony.findMany({
            where: { guestId: { in: guestIds } },
            include: {
              ceremony: { select: { id: true, name: true, sortOrder: true } },
              table: { select: { name: true } },
            },
            orderBy: { ceremony: { sortOrder: "asc" } },
          });

    const ceremoniesByGuest = new Map<string, PassAccessCeremony[]>();
    for (const assignment of assignments) {
      const list = ceremoniesByGuest.get(assignment.guestId) ?? [];
      list.push({
        id: assignment.ceremonyId,
        name: assignment.ceremony.name,
        tableName: assignment.table?.name ?? null,
        numGuests: Math.max(1, assignment.numGuests || 1),
        availability: assignment.availability,
      });
      ceremoniesByGuest.set(assignment.guestId, list);
    }

    const items = guests.map((guest) => {
      const ceremonies = ceremoniesByGuest.get(guest.id) ?? [];
      const confirmed = getConfirmedCeremonies(ceremonies);
      const valid = isPassValid(ceremonies);

      return {
        token: guest.token,
        guestName: guest.name,
        guestGenre: guest.genre,
        numGuests: guest.numGuests,
        valid,
        invalidReason: valid ? null : getPassInvalidReason(ceremonies),
        ceremonies: confirmed.map((ceremony) => ({
          id: ceremony.id,
          name: ceremony.name,
          tableName: ceremony.tableName,
          numGuests: ceremony.numGuests,
        })),
      };
    });

    return jsonOk({
      syncedAt: new Date().toISOString(),
      count: items.length,
      guests: items,
    });
  } catch (error) {
    console.error("GET /api/check-in/sync", error);
    return jsonError(
      error instanceof Error
        ? error.message
        : "Une erreur technique est survenue.",
      500,
    );
  }
}
