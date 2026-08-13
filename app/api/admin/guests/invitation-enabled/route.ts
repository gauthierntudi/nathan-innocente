import { jsonError, jsonOk } from "@/lib/api-response";
import { serializeGuest } from "@/lib/admin/types";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

type Body = {
  enabled?: boolean;
  guestIds?: string[];
};

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  if (typeof body?.enabled !== "boolean") {
    return jsonError("Paramètre « enabled » requis (true/false)");
  }

  const guestIds = Array.isArray(body.guestIds)
    ? [...new Set(body.guestIds.filter((id) => typeof id === "string" && id.trim()))]
    : [];

  if (guestIds.length === 0) {
    return jsonError("Aucun invité sélectionné");
  }

  const result = await prisma.guest.updateMany({
    where: { id: { in: guestIds } },
    data: { invitationEnabled: body.enabled },
  });

  const guests = await prisma.guest.findMany({
    where: { id: { in: guestIds } },
    include: {
      guestCeremonies: {
        include: {
          group: { select: { name: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const action = body.enabled ? "activée" : "désactivée";
  return jsonOk({
    message: `Invitation ${action} pour ${result.count} invité${result.count > 1 ? "s" : ""}`,
    updatedCount: result.count,
    guests: guests.map(serializeGuest),
  });
}
