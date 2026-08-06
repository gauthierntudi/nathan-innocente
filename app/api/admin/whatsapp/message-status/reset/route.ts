import { jsonError, jsonOk } from "@/lib/api-response";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

type ResetBody = {
  guestId?: string;
};

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as ResetBody;
  const guestId = body.guestId ?? "";

  if (!guestId) {
    return jsonError("Invité manquant");
  }

  const guest = await prisma.guest.findUnique({
    where: { id: guestId },
    select: {
      id: true,
      name: true,
      statusSend: true,
      statusReminderSent: true,
    },
  });

  if (!guest) {
    return jsonError("Invité introuvable", 404);
  }

  if (!guest.statusSend && !guest.statusReminderSent) {
    return jsonError("Aucun statut message à réinitialiser");
  }

  await prisma.guest.update({
    where: { id: guest.id },
    data: {
      statusSend: false,
      statusReminderSent: false,
    },
  });

  return jsonOk({
    message: `Statut message réinitialisé pour ${guest.name} — à inviter à nouveau`,
  });
}
