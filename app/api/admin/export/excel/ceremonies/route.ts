import { jsonError } from "@/lib/api-response";
import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import {
  buildCeremonyListsWorkbook,
  ceremonyExportFilename,
} from "@/lib/admin/export-ceremony-excel";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const { searchParams } = new URL(request.url);
  const rawCeremony = searchParams.get("ceremony")?.trim() ?? "";
  const ceremonyId = rawCeremony && isCeremonyId(rawCeremony) ? rawCeremony : null;

  if (rawCeremony && !ceremonyId) {
    return jsonError("Cérémonie invalide");
  }

  const assignments = await prisma.guestCeremony.findMany({
    where: ceremonyId ? { ceremonyId } : undefined,
    include: {
      guest: true,
      table: { select: { name: true, sortOrder: true } },
      group: { select: { name: true, sortOrder: true } },
      ceremony: { select: { id: true, name: true, sortOrder: true } },
    },
    orderBy: { guest: { name: "asc" } },
  });

  const buffer = await buildCeremonyListsWorkbook(assignments, { ceremonyId });
  const filename = ceremonyExportFilename(ceremonyId as CeremonyId | null);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "max-age=0",
    },
  });
}
