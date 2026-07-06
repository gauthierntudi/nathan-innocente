import { jsonError, jsonOk } from "@/lib/api-response";
import {
  DEFAULT_VARIABLES_MAP,
  type VariablesMap,
} from "@/lib/admin/types";
import { requireAdmin } from "@/lib/admin-auth";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { sendInvitationWhatsApp } from "@/lib/twilio";

type InviteBody = {
  guestId?: string;
  variablesMap?: VariablesMap;
};

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as InviteBody;
  const guestId = body.guestId ?? "";
  const variablesMap = body.variablesMap ?? DEFAULT_VARIABLES_MAP;

  if (!guestId) {
    return jsonError("Invité manquant");
  }

  const guest = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!guest) {
    return jsonError("Invité introuvable");
  }

  const result = await sendInvitationWhatsApp(guest, variablesMap);
  if (!result.ok) {
    return jsonError(result.message ?? "Erreur Twilio");
  }

  await prisma.guest.update({
    where: { id: guest.id },
    data: { statusSend: true },
  });

  return jsonOk({ message: `Message envoyé à ${guest.name}` });
}

type BulkBody = {
  phones?: string[];
  variablesMap?: VariablesMap;
};

export async function PUT(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as BulkBody;
  const phones = body.phones ?? [];
  const variablesMap = body.variablesMap ?? DEFAULT_VARIABLES_MAP;

  if (phones.length === 0) {
    return jsonError("Aucun destinataire");
  }

  const guests = await prisma.guest.findMany();
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

    const result = await sendInvitationWhatsApp(guest, variablesMap);
    if (result.ok) {
      await prisma.guest.update({
        where: { id: guest.id },
        data: { statusSend: true },
      });
      results.push({ phone: cleanPhone, success: true });
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
