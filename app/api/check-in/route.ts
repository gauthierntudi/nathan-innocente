import { timingSafeEqual } from "node:crypto";

import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
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

function mapConfirmedCeremony(ceremony: {
  id: string;
  name: string;
  tableName: string | null;
  numGuests: number;
}) {
  return {
    id: ceremony.id,
    name: ceremony.name,
    tableName: ceremony.tableName,
    numGuests: ceremony.numGuests,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token")?.trim() ?? "";
    const ceremonyIdRaw = url.searchParams.get("ceremonyId")?.trim() ?? "";

    if (!token) {
      return jsonError("Pass invalide", 400);
    }

    const guest = await prisma.guest.findUnique({ where: { token } });
    if (!guest) {
      return jsonError("Pass introuvable", 404);
    }

    const payload = await buildPassAccessPayload(guest);

    if (ceremonyIdRaw) {
      if (!isCeremonyId(ceremonyIdRaw)) {
        return jsonError("Cérémonie invalide", 400);
      }

      const assignment = await prisma.guestCeremony.findUnique({
        where: {
          guestId_ceremonyId: {
            guestId: guest.id,
            ceremonyId: ceremonyIdRaw,
          },
        },
        include: {
          ceremony: { select: { id: true, name: true } },
          table: { select: { name: true } },
        },
      });

      if (!assignment) {
        return jsonError("Invité non affecté à cette cérémonie", 403);
      }
      if (assignment.availability !== true) {
        return jsonError("Présence non confirmée pour cette cérémonie", 403);
      }

      const ceremony = {
        id: assignment.ceremonyId,
        name: assignment.ceremony.name,
        tableName: assignment.table?.name ?? null,
        numGuests: Math.max(1, assignment.numGuests || guest.numGuests),
      };

      if (assignment.checkedInAt) {
        return jsonError("Pass déjà utilisé pour cette cérémonie", 409, {
          alreadyUsed: true,
          checkedInAt: assignment.checkedInAt.toISOString(),
          ceremonyId: ceremonyIdRaw,
          guestName: payload.guestName,
          guestGenre: payload.guestGenre,
          numGuests: ceremony.numGuests,
          ceremonies: [ceremony],
        });
      }

      return jsonOk({
        guestName: payload.guestName,
        guestGenre: payload.guestGenre,
        numGuests: ceremony.numGuests,
        ceremonies: [ceremony],
        ceremonyId: ceremonyIdRaw,
        valid: true,
        alreadyUsed: false,
        checkedInAt: null,
      });
    }

    // Legacy: sans cérémonie sélectionnée
    if (!payload.valid) {
      return jsonError(payload.invalidReason ?? "Pass non valide", 403);
    }

    return jsonOk({
      guestName: payload.guestName,
      guestGenre: payload.guestGenre,
      numGuests: payload.numGuests,
      ceremonies: payload.confirmedCeremonies.map(mapConfirmedCeremony),
      valid: true,
      alreadyUsed: false,
      checkedInAt: null,
    });
  } catch (error) {
    console.error("GET /api/check-in", error);
    return jsonError(
      error instanceof Error
        ? error.message
        : "Une erreur technique est survenue.",
      500,
    );
  }
}

type CheckInBody = {
  token?: string;
  ceremonyId?: string;
};

/**
 * Consomme le pass pour une cérémonie (premier scan staff).
 * Auth: Authorization Bearer <CHECKIN_SYNC_KEY|ADMIN_PASSWORD>
 */
export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization");
    const keyHeader = request.headers.get("x-checkin-key");
    if (!verifyCheckInSyncKey(auth) && !verifyCheckInSyncKey(keyHeader)) {
      return jsonError("Non autorisé", 401);
    }

    const body = (await request.json()) as CheckInBody;
    const token = body.token?.trim() ?? "";
    const ceremonyIdRaw = body.ceremonyId?.trim() ?? "";

    if (!token) {
      return jsonError("Pass invalide", 400);
    }
    if (!ceremonyIdRaw || !isCeremonyId(ceremonyIdRaw)) {
      return jsonError("Sélectionnez une cérémonie", 400);
    }
    const ceremonyId = ceremonyIdRaw as CeremonyId;

    const guest = await prisma.guest.findUnique({ where: { token } });
    if (!guest) {
      return jsonError("Pass introuvable", 404);
    }

    const assignment = await prisma.guestCeremony.findUnique({
      where: {
        guestId_ceremonyId: { guestId: guest.id, ceremonyId },
      },
      include: {
        ceremony: { select: { id: true, name: true } },
        table: { select: { name: true } },
      },
    });

    if (!assignment) {
      return jsonError("Invité non affecté à cette cérémonie", 403);
    }
    if (assignment.availability !== true) {
      return jsonError("Présence non confirmée pour cette cérémonie", 403);
    }

    const ceremony = {
      id: assignment.ceremonyId,
      name: assignment.ceremony.name,
      tableName: assignment.table?.name ?? null,
      numGuests: Math.max(1, assignment.numGuests || guest.numGuests),
    };

    if (assignment.checkedInAt) {
      return jsonError("Pass déjà utilisé pour cette cérémonie", 409, {
        alreadyUsed: true,
        checkedInAt: assignment.checkedInAt.toISOString(),
        ceremonyId,
        guestName: guest.name,
        guestGenre: guest.genre,
        numGuests: ceremony.numGuests,
        ceremonies: [ceremony],
      });
    }

    const claimed = await prisma.guestCeremony.updateMany({
      where: {
        guestId: guest.id,
        ceremonyId,
        checkedInAt: null,
        availability: true,
      },
      data: { checkedInAt: new Date() },
    });

    if (claimed.count === 0) {
      const refreshed = await prisma.guestCeremony.findUnique({
        where: {
          guestId_ceremonyId: { guestId: guest.id, ceremonyId },
        },
      });
      return jsonError("Pass déjà utilisé pour cette cérémonie", 409, {
        alreadyUsed: true,
        checkedInAt: refreshed?.checkedInAt?.toISOString() ?? null,
        ceremonyId,
        guestName: guest.name,
        guestGenre: guest.genre,
        numGuests: ceremony.numGuests,
        ceremonies: [ceremony],
      });
    }

    return jsonOk({
      guestName: guest.name,
      guestGenre: guest.genre,
      numGuests: ceremony.numGuests,
      ceremonies: [ceremony],
      ceremonyId,
      valid: true,
      alreadyUsed: false,
      checkedInAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/check-in", error);
    return jsonError(
      error instanceof Error
        ? error.message
        : "Une erreur technique est survenue.",
      500,
    );
  }
}
