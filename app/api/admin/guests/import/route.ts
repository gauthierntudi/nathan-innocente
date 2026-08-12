import { jsonError, jsonOk } from "@/lib/api-response";
import { resolveGuestWrite } from "@/lib/admin/guest-assign";
import {
  normalizeCeremonyIds,
  parseGuestsCsv,
  validateGuestCreateInput,
} from "@/lib/admin/guest-create";
import {
  buildGuestPhoneIndex,
  findGuestInPhoneIndex,
  registerGuestInPhoneIndex,
} from "@/lib/admin/guest-phone-lookup";
import { parseGuestType } from "@/lib/admin/guest-type";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type ImportBody = {
  csv?: string;
  ceremonyIds?: string[];
  guestType?: string;
  groupName?: string;
};

function formatImportError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      const fields = Array.isArray(error.meta?.target)
        ? (error.meta?.target as string[]).join(", ")
        : "unique";
      return `conflit en base (${fields}) — numéro ou token déjà utilisé`;
    }
    if (error.code === "P2003") {
      return "référence invalide (cérémonie / table)";
    }
    return `erreur base (${error.code})`;
  }
  if (error instanceof Error && error.message.trim()) {
    // Messages Prisma bruts trop longs → première ligne utile
    const firstLine = error.message.split("\n").find((line) => line.trim());
    return firstLine?.trim() || "échec d'enregistrement";
  }
  return "échec d'enregistrement";
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as ImportBody;
  const csv = body.csv ?? "";
  const defaultCeremonyIds = normalizeCeremonyIds(body.ceremonyIds);
  const defaultGuestType = parseGuestType(body.guestType);
  const defaultGroupName = body.groupName?.trim() || "";
  const parsed = parseGuestsCsv(csv);

  if (parsed.errors.length > 0 && parsed.rows.length === 0) {
    return jsonError(parsed.errors[0]);
  }

  const existingGuests = await prisma.guest.findMany({
    select: {
      id: true,
      phone: true,
      name: true,
    },
  });

  const existingByPhone = buildGuestPhoneIndex(existingGuests);

  const created = [];
  const updated = [];
  const duplicates = [];
  const errors: string[] = [];
  let assignedCount = 0;
  let ceremoniesAddedCount = 0;
  let duplicateCreatedCount = 0;
  let duplicateUpdatedCount = 0;
  let fictitiousCreatedCount = 0;
  const lineOffset = parsed.hasHeader ? 2 : 1;

  for (let index = 0; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index];
    const lineNumber = index + lineOffset;
    const ceremonyIds =
      row.ceremonyIds && row.ceremonyIds.length > 0
        ? normalizeCeremonyIds(row.ceremonyIds)
        : defaultCeremonyIds;

    const rowType =
      typeof row.guestType === "string" && row.guestType.trim()
        ? row.guestType
        : defaultGuestType;
    const rowGroupName =
      typeof row.groupName === "string" && row.groupName.trim()
        ? row.groupName.trim()
        : defaultGroupName;

    const validated = validateGuestCreateInput({
      ...row,
      ceremonyIds,
      guestType: rowType,
      groupName: rowGroupName,
    });

    if (!validated.ok) {
      errors.push(`Ligne ${lineNumber}: ${validated.message}`);
      continue;
    }

    const existing =
      validated.data.phoneFictitious || !validated.data.phone
        ? null
        : findGuestInPhoneIndex(existingByPhone, validated.data.phone);

    try {
      const result = await resolveGuestWrite(
        validated.data,
        existing
          ? { id: existing.id, name: existing.name, phone: existing.phone }
          : null,
      );

      if (result.kind === "created") {
        created.push(result.guest);
        if (result.guest.phoneFictitious) fictitiousCreatedCount += 1;
        registerGuestInPhoneIndex(existingByPhone, {
          id: result.guest.id,
          phone: result.guest.phone,
          name: result.guest.name,
        });
        continue;
      }

      if (result.kind === "updated") {
        updated.push(result.guest);
        assignedCount += 1;
        ceremoniesAddedCount += result.addedCeremonyCount;
        registerGuestInPhoneIndex(existingByPhone, {
          id: result.guest.id,
          phone: result.guest.phone,
          name: result.guest.name,
        });
        continue;
      }

      duplicates.push(result.duplicate);
      if (result.duplicateCreated) duplicateCreatedCount += 1;
      else duplicateUpdatedCount += 1;
    } catch (error) {
      console.error(`POST /api/admin/guests/import ligne ${lineNumber}`, error);
      errors.push(`Ligne ${lineNumber}: ${formatImportError(error)}`);
    }
  }

  if (
    created.length === 0 &&
    updated.length === 0 &&
    duplicates.length === 0
  ) {
    return jsonError(errors[0] ?? "Aucun invité importé");
  }

  const parts = [
    created.length ? `${created.length} créé(s)` : null,
    fictitiousCreatedCount
      ? `${fictitiousCreatedCount} avec n° fictif`
      : null,
    assignedCount ? `${assignedCount} existant(s) mis à jour` : null,
    ceremoniesAddedCount
      ? `${ceremoniesAddedCount} cérémonie(s) ajoutée(s)`
      : null,
    duplicateCreatedCount
      ? `${duplicateCreatedCount} doublon(s) enregistré(s)`
      : null,
    duplicateUpdatedCount
      ? `${duplicateUpdatedCount} doublon(s) mis à jour`
      : null,
  ].filter(Boolean);

  return jsonOk({
    message: parts.join(" · ") || "Import terminé",
    createdCount: created.length,
    fictitiousCreatedCount,
    updatedCount: assignedCount,
    ceremoniesAddedCount,
    duplicateCreatedCount,
    duplicateUpdatedCount,
    errorCount: errors.length,
    errors: errors.slice(0, 20),
    guests: [...created, ...updated],
    duplicates,
  });
}
