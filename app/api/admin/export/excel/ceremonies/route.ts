import { jsonError } from "@/lib/api-response";
import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import {
  buildCeremonyListsWorkbook,
  ceremonyExportFilename,
} from "@/lib/admin/export-ceremony-excel";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const assignmentInclude = {
  guest: true,
  table: { select: { name: true, sortOrder: true } },
  group: { select: { id: true, name: true, sortOrder: true } },
  ceremony: { select: { id: true, name: true, sortOrder: true } },
} as const;

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const { searchParams } = new URL(request.url);
  const rawCeremony = searchParams.get("ceremony")?.trim() ?? "";
  const ceremonyId = rawCeremony && isCeremonyId(rawCeremony) ? rawCeremony : null;
  const groupId = searchParams.get("group")?.trim() || null;
  const byGroups = searchParams.get("by") === "groups";

  if (rawCeremony && !ceremonyId) {
    return jsonError("Cérémonie invalide");
  }

  if (groupId) {
    const group = await prisma.ceremonyGroup.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, ceremonyId: true },
    });
    if (!group) {
      return jsonError("Groupe introuvable", 404);
    }

    const assignments = await prisma.guestCeremony.findMany({
      where: { groupId: group.id },
      include: assignmentInclude,
      orderBy: { guest: { name: "asc" } },
    });

    const buffer = await buildCeremonyListsWorkbook(assignments, {
      groupId: group.id,
      ceremonyId: isCeremonyId(group.ceremonyId) ? group.ceremonyId : null,
    });
    const filename = ceremonyExportFilename(null, { groupName: group.name });

    return excelResponse(buffer, filename);
  }

  const assignments = await prisma.guestCeremony.findMany({
    where: ceremonyId ? { ceremonyId } : undefined,
    include: assignmentInclude,
    orderBy: { guest: { name: "asc" } },
  });

  const buffer = await buildCeremonyListsWorkbook(assignments, {
    ceremonyId,
    byGroups: Boolean(ceremonyId && byGroups),
  });
  const filename = ceremonyExportFilename(ceremonyId as CeremonyId | null, {
    byGroups: Boolean(ceremonyId && byGroups),
  });

  return excelResponse(buffer, filename);
}

function excelResponse(buffer: Buffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "max-age=0",
    },
  });
}
