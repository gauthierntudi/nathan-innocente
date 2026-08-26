import { jsonError, jsonOk } from "@/lib/api-response";
import { resetGuestCeremonyCheckIns } from "@/lib/admin/ceremonies";
import { isCeremonyId } from "@/lib/admin/ceremony-types";
import { serializeGuest } from "@/lib/admin/types";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const guestCeremonySelect = {
  ceremonyId: true,
  tableId: true,
  groupId: true,
  group: { select: { name: true } },
  availability: true,
  confirmedGuests: true,
  numGuests: true,
  dressCodeDownloadedAt: true,
  checkedInAt: true,
} as const;

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
    select: { checkedInAt: true },
  });

  if (!assignment) {
    return jsonError("Invitation introuvable pour cette cérémonie", 404);
  }

  if (!assignment.checkedInAt) {
    return jsonError("Aucun check-in à réinitialiser pour cette cérémonie");
  }

  const resetCount = await resetGuestCeremonyCheckIns(guestId, [ceremonyId]);

  const guest = await prisma.guest.findUniqueOrThrow({
    where: { id: guestId },
    include: {
      guestCeremonies: {
        select: guestCeremonySelect,
      },
    },
  });

  return jsonOk({
    message:
      resetCount > 0
        ? "Check-in réinitialisé — le pass peut être rescanné pour cette cérémonie"
        : "Aucune modification",
    guest: serializeGuest(guest),
  });
}
