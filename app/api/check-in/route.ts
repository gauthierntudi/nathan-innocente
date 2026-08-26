import { timingSafeEqual } from "node:crypto";

import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import { jsonError, jsonOk } from "@/lib/api-response";
import { buildPassAccessPayload } from "@/lib/pass-access";
import {
  parsePassQrFromSearchParams,
  verifyPassQrParts,
} from "@/lib/pass-qr";
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

function resolveGuestTokenFromRequest(input: {
  token?: string | null;
  exp?: string | number | null;
  sig?: string | null;
}): { token: string } | { error: string } {
  const verified = verifyPassQrParts(input);
  if (!verified.ok) {
    return { error: verified.message };
  }
  return { token: verified.token };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parts = parsePassQrFromSearchParams(url.searchParams);
    const ceremonyIdRaw = url.searchParams.get("ceremonyId")?.trim() ?? "";

    const resolved = resolveGuestTokenFromRequest(parts);
    if ("error" in resolved) {
      return jsonError(resolved.error, 403);
    }
    const token = resolved.token;

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
  exp?: string | number;
  sig?: string;
  ceremonyId?: string;
  /** Claim différé app staff (clé sync déjà vérifiée). */
  source?: string;
};

/**
 * Consomme le pass pour une cérémonie (premier scan staff).
 * Auth: Authorization Bearer <CHECKIN_SYNC_KEY|ADMIN_PASSWORD>
 * QR: token + exp + sig (TTL 30 min)
 */
export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization");
    const keyHeader = request.headers.get("x-checkin-key");
    if (!verifyCheckInSyncKey(auth) && !verifyCheckInSyncKey(keyHeader)) {
      return jsonError("Non autorisé", 401);
    }

    const body = (await request.json()) as CheckInBody;
    const ceremonyIdRaw = body.ceremonyId?.trim() ?? "";

    let token = "";
    const hasSignedQr =
      body.sig != null &&
      String(body.sig).trim() !== "" &&
      body.exp != null &&
      String(body.exp).trim() !== "";

    if (hasSignedQr) {
      const resolved = resolveGuestTokenFromRequest({
        token: body.token,
        exp: body.exp,
        sig: body.sig,
      });
      if ("error" in resolved) {
        return jsonError(resolved.error, 403);
      }
      token = resolved.token;
    } else if (body.source === "staff-offline") {
      // Claim différé depuis l'app staff (déjà authentifiée par la clé sync).
      token = body.token?.trim() ?? "";
      if (!token) {
        return jsonError("Pass invalide", 400);
      }
    } else {
      return jsonError(
        "QR non signé ou expiré — l'invité doit rouvrir son pass d'accès.",
        403,
      );
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
