import { jsonError, jsonOk } from "@/lib/api-response";
import { canSendReminder, serializeGuest } from "@/lib/admin/types";
import { requireAdmin } from "@/lib/admin-auth";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { sendReminderWhatsApp } from "@/lib/twilio";

type ReminderBody = {
  guestId?: string;
  limit?: number;
};

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as ReminderBody;
  const guestId = body.guestId ?? "";

  if (!guestId) {
    return jsonError("Invité manquant");
  }

  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest) {
    return jsonError("Invité non trouvé");
  }

  const serialized = serializeGuest(guest);

  if (!canSendReminder(serialized)) {
    if (guest.availability !== null) {
      return jsonError("L'invité a déjà répondu");
    }
    return jsonError("L'appareil est déjà lié et un rappel a déjà été envoyé");
  }

  const result = await sendReminderWhatsApp(guest);
  if (!result.ok) {
    return jsonError(result.message ?? "Erreur Twilio");
  }

  await prisma.guest.update({
    where: { id: guest.id },
    data: { statusReminderSent: true },
  });

  return jsonOk({});
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as ReminderBody;
  const limit = body.limit ?? 0;

  const guests = await prisma.guest.findMany();
  const results: Array<{ phone: string; success: boolean; message?: string }> =
    [];
  let sentCount = 0;
  let failCount = 0;

  for (const guest of guests) {
    const serialized = serializeGuest(guest);

    if (!canSendReminder(serialized)) continue;
    if (limit > 0 && sentCount >= limit) break;

    const cleanPhone = normalizePhone(guest.phone);
    if (!cleanPhone) continue;

    const result = await sendReminderWhatsApp(guest);
    if (result.ok) {
      await prisma.guest.update({
        where: { id: guest.id },
        data: { statusReminderSent: true },
      });
      results.push({ phone: cleanPhone, success: true });
      sentCount += 1;
    } else {
      results.push({
        phone: cleanPhone,
        success: false,
        message: result.message ?? "Erreur Twilio",
      });
      failCount += 1;
    }
  }

  return jsonOk({ sentCount, failCount, results });
}
