import { jsonError, jsonOk } from "@/lib/api-response";
import {
  resetGuestCeremonyResponses,
  syncGuestCeremonies,
} from "@/lib/admin/ceremonies";
import {
  assignGuestToGroupByName,
  resolveGuestEditPhoneConflict,
} from "@/lib/admin/guest-assign";
import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import { normalizeCeremonyIds } from "@/lib/admin/guest-create";
import { parseGuestType } from "@/lib/admin/guest-type";
import { serializeGuest } from "@/lib/admin/types";
import { requireAdmin } from "@/lib/admin-auth";
import { syncGuestAvailabilityAggregate } from "@/lib/guests";
import { normalizePhone, phoneLookupVariants } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

type UpdateGuestBody = {
  name?: string;
  phone?: string;
  numGuests?: number;
  guestType?: string;
  groupName?: string;
  ceremonyIds?: string[];
  resetCeremonyIds?: string[];
  ceremonyNumGuests?: Array<{ ceremonyId: string; numGuests: number }>;
};

type RouteContext = {
  params: Promise<{ guestId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const { guestId } = await context.params;
  if (!guestId) {
    return jsonError("Invité manquant");
  }

  const existing = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!existing) {
    return jsonError("Invité introuvable", 404);
  }

  const body = (await request.json()) as UpdateGuestBody;
  const name = body.name?.trim() ?? "";
  const phoneRaw = body.phone?.trim() ?? "";
  const numGuests = Number(body.numGuests);
  const groupName = body.groupName?.trim() ?? "";
  const ceremonyIds = normalizeCeremonyIds(body.ceremonyIds);
  const resetCeremonyIds = normalizeCeremonyIds(body.resetCeremonyIds);
  const ceremonyNumGuests: Partial<Record<CeremonyId, number>> = {};

  for (const item of body.ceremonyNumGuests ?? []) {
    if (!isCeremonyId(item.ceremonyId)) continue;
    if (!ceremonyIds.includes(item.ceremonyId)) continue;
    const seats = Number(item.numGuests);
    if (!Number.isFinite(seats) || seats < 1 || seats > 50) {
      return jsonError(
        `Le nombre de convives pour « ${item.ceremonyId} » doit être entre 1 et 50`,
      );
    }
    ceremonyNumGuests[item.ceremonyId] = Math.floor(seats);
  }

  if (!name) {
    return jsonError("Le nom est requis");
  }

  if (!phoneRaw) {
    return jsonError("Le numéro est requis");
  }

  if (!Number.isFinite(numGuests) || numGuests < 1 || numGuests > 50) {
    return jsonError("Le nombre de convives doit être entre 1 et 50");
  }

  const phone = normalizePhone(phoneRaw);
  if (phone.length < 8) {
    return jsonError("Numéro de téléphone invalide");
  }

  const guestType = parseGuestType(body.guestType ?? existing.guestType);

  const phoneConflict = await prisma.guest.findFirst({
    where: {
      phone: { in: phoneLookupVariants(phone) },
      NOT: { id: guestId },
    },
    select: { id: true, name: true },
  });

  if (phoneConflict) {
    const conflictResult = await resolveGuestEditPhoneConflict({
      editedGuestId: guestId,
      conflictGuest: phoneConflict,
      name,
      phone,
      numGuests: Math.floor(numGuests),
      guestType,
      ceremonyIds,
      ceremonyNumGuests,
      groupName: groupName.length > 0 ? groupName : null,
      resetCeremonyIds,
      genre: existing.genre,
    });

    if (conflictResult.kind === "merged") {
      return jsonOk({
        message: conflictResult.message,
        guest: conflictResult.guest,
        merged: true,
        removedGuestId: conflictResult.removedGuestId,
      });
    }

    return jsonOk({
      message: conflictResult.message,
      guest: conflictResult.guest,
      isDuplicate: true,
      duplicate: conflictResult.duplicate,
    });
  }

  const confirmedGuests = Math.min(existing.confirmedGuests, Math.floor(numGuests));

  await prisma.guest.update({
    where: { id: guestId },
    data: {
      name,
      phone,
      numGuests: Math.floor(numGuests),
      confirmedGuests,
      guestType,
    },
  });

  await syncGuestCeremonies(
    guestId,
    ceremonyIds,
    Math.floor(numGuests),
    ceremonyNumGuests,
  );

  await assignGuestToGroupByName(
    guestId,
    ceremonyIds,
    groupName.length > 0 ? groupName : null,
  );

  let resetCount = 0;
  if (resetCeremonyIds.length > 0) {
    resetCount = await resetGuestCeremonyResponses(guestId, resetCeremonyIds);
  }

  await syncGuestAvailabilityAggregate(guestId);

  const updated = await prisma.guest.findUniqueOrThrow({
    where: { id: guestId },
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

  const resetSuffix =
    resetCount > 0
      ? ` — ${resetCount} confirmation(s) réinitialisée(s)`
      : "";

  return jsonOk({
    message: `Invité « ${updated.name} » mis à jour${resetSuffix}`,
    guest: serializeGuest(updated),
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const { guestId } = await context.params;
  if (!guestId) {
    return jsonError("Invité manquant");
  }

  const existing = await prisma.guest.findUnique({
    where: { id: guestId },
    select: { id: true, name: true },
  });
  if (!existing) {
    return jsonError("Invité introuvable", 404);
  }

  await prisma.guest.delete({ where: { id: guestId } });

  return jsonOk({
    message: `Invité « ${existing.name} » supprimé`,
    guestId: existing.id,
  });
}
