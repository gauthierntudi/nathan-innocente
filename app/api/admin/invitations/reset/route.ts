import { jsonError, jsonOk } from "@/lib/api-response";
import { resetGuestCeremonyResponses } from "@/lib/admin/ceremonies";
import { isCeremonyId } from "@/lib/admin/ceremony-types";
import { serializeGuest } from "@/lib/admin/types";
import { requireAdmin } from "@/lib/admin-auth";
import { syncGuestAvailabilityAggregate } from "@/lib/guests";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as {
    guestId?: string;
    ceremonyId?: string;
  };

  const guestId = body.guestId?.trim() ?? "";
  const ceremonyId = body.ceremonyId?.trim() ?? "";

  if (!guestId) {
    return jsonError("Invité requis");
  }

  if (!isCeremonyId(ceremonyId)) {
    return jsonError("Cérémonie invalide");
  }

  const assignment = await prisma.guestCeremony.findUnique({
    where: {
      guestId_ceremonyId: { guestId, ceremonyId },
    },
    select: {
      availability: true,
      confirmedGuests: true,
      dressCodeDownloadedAt: true,
    },
  });

  if (!assignment) {
    return jsonError("Invitation introuvable pour cette cérémonie", 404);
  }

  const canReset =
    assignment.availability !== null ||
    assignment.confirmedGuests > 0 ||
    assignment.dressCodeDownloadedAt !== null;

  if (!canReset) {
    return jsonError("Aucune confirmation à réinitialiser");
  }

  const resetCount = await resetGuestCeremonyResponses(guestId, [ceremonyId]);
  await syncGuestAvailabilityAggregate(guestId);

  const guest = await prisma.guest.findUniqueOrThrow({
    where: { id: guestId },
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

  return jsonOk({
    message:
      resetCount > 0
        ? "Confirmation réinitialisée — l'invité peut répondre à nouveau"
        : "Aucune modification",
    guest: serializeGuest(guest),
  });
}
