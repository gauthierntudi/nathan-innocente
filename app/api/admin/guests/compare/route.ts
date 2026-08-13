import { jsonError, jsonOk } from "@/lib/api-response";
import { isCeremonyId, type CeremonyId } from "@/lib/admin/ceremony-types";
import {
  buildGuestCompareReport,
  isDbGuestsMode,
  isFileGuestsMode,
  parseGuestsCompareFile,
  type DbGuestsMode,
  type FileGuestsMode,
} from "@/lib/admin/guest-compare";
import { serializeGuest } from "@/lib/admin/types";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

function parseCeremonyFilter(value: FormDataEntryValue | null | undefined): CeremonyId | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "all") return null;
  return isCeremonyId(trimmed) ? trimmed : null;
}

function parseFileGuestsMode(value: FormDataEntryValue | null | undefined): FileGuestsMode {
  if (typeof value === "string" && isFileGuestsMode(value)) return value;
  return "sum";
}

function parseDbGuestsMode(value: FormDataEntryValue | null | undefined): DbGuestsMode {
  if (typeof value === "string" && isDbGuestsMode(value)) return value;
  return "sum";
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const contentType = request.headers.get("content-type") ?? "";
  let filename = "";
  let buffer: Buffer | undefined;
  let csvText: string | undefined;
  let ceremonyId: CeremonyId | null = null;
  let fileGuestsMode: FileGuestsMode = "sum";
  let dbGuestsMode: DbGuestsMode = "sum";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (file instanceof File) {
      filename = file.name;
      buffer = Buffer.from(await file.arrayBuffer());
    }
    const csvField = form.get("csv");
    if (typeof csvField === "string" && csvField.trim()) {
      csvText = csvField;
    }
    ceremonyId = parseCeremonyFilter(form.get("ceremonyId"));
    fileGuestsMode = parseFileGuestsMode(form.get("fileGuestsMode"));
    dbGuestsMode = parseDbGuestsMode(form.get("dbGuestsMode"));
  } else {
    const body = (await request.json().catch(() => null)) as {
      csv?: string;
      filename?: string;
      ceremonyId?: string;
      fileGuestsMode?: string;
      dbGuestsMode?: string;
    } | null;
    csvText = body?.csv;
    filename = body?.filename ?? "";
    ceremonyId = parseCeremonyFilter(body?.ceremonyId ?? null);
    fileGuestsMode = parseFileGuestsMode(body?.fileGuestsMode ?? null);
    dbGuestsMode = parseDbGuestsMode(body?.dbGuestsMode ?? null);
  }

  if ((!buffer || buffer.length === 0) && !csvText?.trim()) {
    return jsonError("Fichier Excel/CSV requis");
  }

  const parsed = await parseGuestsCompareFile({
    filename,
    buffer,
    csvText,
    ceremonyId,
  });

  if (parsed.rows.length === 0) {
    return jsonError(
      parsed.errors[0] ??
        (ceremonyId
          ? "Aucun invité pour cette cérémonie dans le fichier"
          : "Aucune ligne invité dans le fichier"),
    );
  }

  const guests = await prisma.guest.findMany({
    include: {
      guestCeremonies: {
        include: {
          group: { select: { name: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const report = buildGuestCompareReport(
    parsed.rows,
    guests.map(serializeGuest),
    parsed.columns,
    parsed.errors,
    { ceremonyId, fileGuestsMode, dbGuestsMode },
  );

  return jsonOk({ report });
}
