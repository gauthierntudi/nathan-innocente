import { jsonError, jsonOk } from "@/lib/api-response";
import { sendGuestConfirmationMessages } from "@/lib/admin/send-confirmation";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

type ConfirmBody = {
  guestId?: string;
  guestIds?: string[];
};

async function loadGuest(guestId: string) {
  return prisma.guest.findUnique({
    where: { id: guestId },
    include: { guestCeremonies: true },
  });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  if (!process.env.TWILIO_TEMPLATE_CONFIRM?.trim()) {
    return jsonError("Template de confirmation manquant (TWILIO_TEMPLATE_CONFIRM)");
  }

  const body = (await request.json()) as ConfirmBody;
  const guestId = body.guestId?.trim() ?? "";

  if (!guestId) {
    return jsonError("Invité manquant");
  }

  const guest = await loadGuest(guestId);
  if (!guest) {
    return jsonError("Invité introuvable");
  }
  if (guest.phoneFictitious) {
    return jsonError("Numéro fictif : WhatsApp impossible");
  }

  const result = await sendGuestConfirmationMessages(guest);
  if (result.sent === 0) {
    return jsonError(
      result.message ??
        "Impossible d'envoyer la confirmation (aucune cérémonie confirmée ?)",
    );
  }

  const ceremonyCount = Math.max(1, result.ceremonyIds.length);
  const message =
    result.failed > 0
      ? `Confirmation partiellement envoyée à ${guest.name} (${result.sent}/${ceremonyCount})`
      : `Confirmation renvoyée à ${guest.name} (${ceremonyCount} cérémonie${ceremonyCount > 1 ? "s" : ""})`;

  return jsonOk({
    sent: result.sent,
    failed: result.failed,
    ceremonyIds: result.ceremonyIds,
    message,
  });
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  if (!process.env.TWILIO_TEMPLATE_CONFIRM?.trim()) {
    return jsonError("Template de confirmation manquant (TWILIO_TEMPLATE_CONFIRM)");
  }

  const body = (await request.json()) as ConfirmBody;
  const guestIds = Array.from(new Set((body.guestIds ?? []).filter(Boolean)));

  if (guestIds.length === 0) {
    return jsonError("Aucun invité sélectionné");
  }

  const guests = await prisma.guest.findMany({
    where: { id: { in: guestIds } },
    include: { guestCeremonies: true },
  });
  const byId = new Map(guests.map((guest) => [guest.id, guest]));

  let sentGuests = 0;
  let sentMessages = 0;
  let failCount = 0;

  for (const guestId of guestIds) {
    const guest = byId.get(guestId);
    if (!guest || guest.phoneFictitious) {
      failCount += 1;
      continue;
    }

    const result = await sendGuestConfirmationMessages(guest);
    if (result.ok && result.sent > 0) {
      sentGuests += 1;
      sentMessages += result.sent;
    } else {
      failCount += 1;
    }
  }

  return jsonOk({
    sentGuests,
    sentMessages,
    failCount,
    message: `Confirmations — Invités: ${sentGuests} | Messages: ${sentMessages} | Erreurs: ${failCount}`,
  });
}
