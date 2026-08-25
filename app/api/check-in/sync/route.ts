import { timingSafeEqual } from "node:crypto";

import { jsonError, jsonOk } from "@/lib/api-response";
import { buildPassAccessPayload } from "@/lib/pass-access";
import { prisma } from "@/lib/prisma";

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
    });

    const items = await Promise.all(
      guests.map(async (guest) => {
        const payload = await buildPassAccessPayload(guest);
        return {
          token: guest.token,
          guestName: payload.guestName,
          guestGenre: payload.guestGenre,
          numGuests: payload.numGuests,
          valid: payload.valid,
          invalidReason: payload.invalidReason,
          ceremonies: payload.confirmedCeremonies.map((ceremony) => ({
            id: ceremony.id,
            name: ceremony.name,
            tableName: ceremony.tableName,
            numGuests: ceremony.numGuests,
          })),
        };
      }),
    );

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
