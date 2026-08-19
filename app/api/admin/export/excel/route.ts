import { jsonError } from "@/lib/api-response";
import {
  guestExportFilename,
  guestsAddedWhere,
  parseExportDateBound,
} from "@/lib/admin/export-date-range";
import { buildGuestsWorkbook } from "@/lib/admin/export-excel";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const { searchParams } = new URL(request.url);
  const from = parseExportDateBound(searchParams.get("from"), "start");
  const to = parseExportDateBound(searchParams.get("to"), "end");
  const fromDay = searchParams.get("fromDay");
  const toDay = searchParams.get("toDay");

  if (searchParams.get("from") && !from) {
    return jsonError("Date de début invalide");
  }
  if (searchParams.get("to") && !to) {
    return jsonError("Date de fin invalide");
  }
  if (from && to && from.getTime() > to.getTime()) {
    return jsonError("La date de début doit précéder la date de fin");
  }

  const guests = await prisma.guest.findMany({
    where: guestsAddedWhere(from, to),
    orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    include: {
      guestCeremonies: {
        include: { group: { select: { name: true } } },
      },
    },
  });
  const buffer = await buildGuestsWorkbook(guests);
  const filename = guestExportFilename(from, to, { fromDay, toDay });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "max-age=0",
    },
  });
}
