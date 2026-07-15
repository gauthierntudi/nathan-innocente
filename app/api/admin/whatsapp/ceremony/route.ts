import { jsonError, jsonOk } from "@/lib/api-response";
import { isCeremonyId } from "@/lib/admin/ceremony-types";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { sendCeremonyWhatsApp } from "@/lib/twilio";

type CeremonySendBody = {
  ceremonyId?: string;
  guestId?: string;
};

type CeremonyBulkBody = {
  ceremonyId?: string;
  guestIds?: string[];
  sendAll?: boolean;
};

async function getAssignedGuests(ceremonyId: string, guestIds?: string[]) {
  return prisma.guestCeremony.findMany({
    where: {
      ceremonyId,
      ...(guestIds?.length ? { guestId: { in: guestIds } } : {}),
    },
    include: { guest: true },
    orderBy: { guest: { name: "asc" } },
  });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as CeremonySendBody;
  const ceremonyId = body.ceremonyId ?? "";
  const guestId = body.guestId ?? "";

  if (!ceremonyId || !isCeremonyId(ceremonyId)) {
    return jsonError("Cérémonie invalide");
  }

  if (!guestId) {
    return jsonError("Invité manquant");
  }

  const assignment = await prisma.guestCeremony.findUnique({
    where: {
      guestId_ceremonyId: {
        guestId,
        ceremonyId,
      },
    },
    include: { guest: true },
  });

  if (!assignment) {
    return jsonError("Cet invité n'est pas affecté à cette cérémonie");
  }

  const result = await sendCeremonyWhatsApp(assignment.guest, ceremonyId);
  if (!result.ok) {
    return jsonError(result.message ?? "Erreur Twilio");
  }

  return jsonOk({ message: `Message envoyé à ${assignment.guest.name}` });
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as CeremonyBulkBody;
  const ceremonyId = body.ceremonyId ?? "";
  const guestIds = body.guestIds ?? [];
  const sendAll = body.sendAll === true;

  if (!ceremonyId || !isCeremonyId(ceremonyId)) {
    return jsonError("Cérémonie invalide");
  }

  if (!sendAll && guestIds.length === 0) {
    return jsonError("Aucun invité sélectionné");
  }

  const assignments = await getAssignedGuests(
    ceremonyId,
    sendAll ? undefined : guestIds,
  );

  if (assignments.length === 0) {
    return jsonError("Aucun invité affecté à cette cérémonie");
  }

  const results: Array<{ guestId: string; success: boolean; message?: string }> =
    [];
  let sentCount = 0;
  let failCount = 0;

  for (const assignment of assignments) {
    const result = await sendCeremonyWhatsApp(assignment.guest, ceremonyId);

    if (result.ok) {
      results.push({ guestId: assignment.guestId, success: true });
      sentCount += 1;
    } else {
      results.push({
        guestId: assignment.guestId,
        success: false,
        message: result.message,
      });
      failCount += 1;
    }
  }

  return jsonOk({ sentCount, failCount, results });
}
