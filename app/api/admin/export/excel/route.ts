import { jsonError } from "@/lib/api-response";
import { buildGuestsWorkbook } from "@/lib/admin/export-excel";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const guests = await prisma.guest.findMany({ orderBy: { name: "asc" } });
  const buffer = await buildGuestsWorkbook(guests);
  const filename = `rapport_invites_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "max-age=0",
    },
  });
}
