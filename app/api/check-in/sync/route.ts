import { timingSafeEqual } from "node:crypto";

import { CEREMONY_DEFINITIONS } from "@/lib/admin/ceremony-types";
import { jsonError, jsonOk } from "@/lib/api-response";
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

    type CeremonyRow = {
      id: string;
      name: string;
      tableName: string | null;
      numGuests: number;
      availability: boolean | null;
      checkedInAt: string | null;
    };

    const ceremoniesByGuest = new Map<string, CeremonyRow[]>();
    for (const assignment of assignments) {
      const list = ceremoniesByGuest.get(assignment.guestId) ?? [];
      list.push({
        id: assignment.ceremonyId,
        name: assignment.ceremony.name,
        tableName: assignment.table?.name ?? null,
        numGuests: Math.max(1, assignment.numGuests || 1),
        availability: assignment.availability,
        checkedInAt: assignment.checkedInAt?.toISOString() ?? null,
      });
      ceremoniesByGuest.set(assignment.guestId, list);
    }

    const items = guests.map((guest) => {
      const ceremonies = ceremoniesByGuest.get(guest.id) ?? [];
      const confirmed = ceremonies.filter((c) => c.availability === true);

      return {
        token: guest.token,
        guestName: guest.name,
        guestGenre: guest.genre,
        numGuests: guest.numGuests,
        valid: confirmed.length > 0,
        invalidReason:
          confirmed.length > 0
            ? null
            : ceremonies.length === 0
              ? "Aucune cérémonie assignée."
              : "Aucune présence confirmée.",
        ceremonies,
      };
    });

    return jsonOk({
      syncedAt: new Date().toISOString(),
      count: items.length,
      ceremonyCatalog: CEREMONY_DEFINITIONS.map((item) => ({
        id: item.id,
        name: item.name,
        sortOrder: item.sortOrder,
      })),
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
