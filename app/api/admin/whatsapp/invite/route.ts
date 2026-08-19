import { jsonError, jsonOk } from "@/lib/api-response";
import {
  canSendInvitation,
  serializeGuest,
} from "@/lib/admin/types";
import { isFailedInviteDelivery } from "@/lib/admin/invite-delivery";
import { requireAdmin } from "@/lib/admin-auth";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { sendInvitationWhatsApp } from "@/lib/twilio";

function inviteSendData(result: { sid?: string; status?: string }) {
  return {
    statusSend: true,
    inviteMessageSid: result.sid ?? null,
    inviteDeliveryStatus: result.status ?? "queued",
    inviteDeliveryError: null as string | null,
    inviteStatusAt: new Date(),
  };
}

type InviteBody = {
  guestId?: string;
};

async function loadGuestForInvite(guestId: string) {
  return prisma.guest.findUnique({
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
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as InviteBody;
  const guestId = body.guestId ?? "";

  if (!guestId) {
    return jsonError("Invité manquant");
  }

  const guest = await loadGuestForInvite(guestId);
  if (!guest) {
    return jsonError("Invité introuvable");
  }

  const adminGuest = serializeGuest(guest);
  if (!canSendInvitation(adminGuest)) {
    if (
      guest.statusSend &&
      !isFailedInviteDelivery(guest.inviteDeliveryStatus)
    ) {
      return jsonError("Invitation déjà envoyée pour cet invité");
    }
    return jsonError(
      "Activez d'abord l'invitation pour cet invité",
    );
  }

  const result = await sendInvitationWhatsApp(guest);
  if (!result.ok) {
    return jsonError(result.message ?? "Erreur Twilio");
  }

  await prisma.guest.update({
    where: { id: guest.id },
    data: inviteSendData(result),
  });

  return jsonOk({
    message: result.message ?? `Invitation envoyée à ${guest.name}`,
  });
}

type BulkBody = {
  phones?: string[];
};

export async function PUT(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as BulkBody;
  const phones = body.phones ?? [];

  if (phones.length === 0) {
    return jsonError("Aucun destinataire");
  }

  const guests = await prisma.guest.findMany({
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
  const indexByPhone = new Map<string, (typeof guests)[number]>();

  for (const guest of guests) {
    const phone = normalizePhone(guest.phone);
    if (phone && !indexByPhone.has(phone)) {
      indexByPhone.set(phone, guest);
    }
  }

  const results: Array<{ phone: string; success: boolean; message?: string }> =
    [];
  let sentCount = 0;
  let failCount = 0;

  for (const rawPhone of phones) {
    const cleanPhone = normalizePhone(rawPhone);
    const guest = cleanPhone ? indexByPhone.get(cleanPhone) : undefined;

    if (!guest) {
      results.push({ phone: rawPhone, success: false, message: "Invité introuvable" });
      failCount += 1;
      continue;
    }

    const adminGuest = serializeGuest(guest);
    if (!canSendInvitation(adminGuest)) {
      results.push({
        phone: cleanPhone,
        success: false,
        message: guest.statusSend
          ? "Invitation déjà envoyée"
          : "Invitation non activée",
      });
      failCount += 1;
      continue;
    }

    const result = await sendInvitationWhatsApp(guest);
    if (result.ok) {
      await prisma.guest.update({
        where: { id: guest.id },
        data: inviteSendData(result),
      });
      results.push({ phone: cleanPhone, success: true, message: result.message });
      sentCount += 1;
    } else {
      results.push({
        phone: cleanPhone,
        success: false,
        message: result.message,
      });
      failCount += 1;
    }
  }

  return jsonOk({ sentCount, failCount, results });
}
