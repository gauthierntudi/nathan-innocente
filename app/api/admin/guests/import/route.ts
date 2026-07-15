import { jsonError, jsonOk } from "@/lib/api-response";
import {
  assignCeremoniesToExistingGuest,
  createGuestWithCeremonies,
} from "@/lib/admin/guest-assign";
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
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

type ImportBody = {
  csv?: string;
  ceremonyIds?: string[];
};

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as ImportBody;
  const csv = body.csv ?? "";
  const defaultCeremonyIds = normalizeCeremonyIds(body.ceremonyIds);
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
  const errors: string[] = [];
  let assignedCount = 0;

  for (let index = 0; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index];
    const lineNumber = index + 2;
    const ceremonyIds =
      row.ceremonyIds && row.ceremonyIds.length > 0
        ? normalizeCeremonyIds(row.ceremonyIds)
        : defaultCeremonyIds;

    const validated = validateGuestCreateInput({
      ...row,
      ceremonyIds,
    });

    if (!validated.ok) {
      errors.push(`Ligne ${lineNumber}: ${validated.message}`);
      continue;
    }

    const existing = findGuestInPhoneIndex(
      existingByPhone,
      validated.data.phone,
    );

    try {
      if (existing) {
        const result = await assignCeremoniesToExistingGuest({
          guestId: existing.id,
          phone: validated.data.phone,
          ceremonyIds: validated.data.ceremonyIds,
          guestName: existing.name,
        });

        updated.push(result.guest);
        assignedCount += 1;

        registerGuestInPhoneIndex(existingByPhone, {
          id: existing.id,
          phone: validated.data.phone,
          name: existing.name,
        });
        continue;
      }

      const result = await createGuestWithCeremonies(validated.data);
      created.push(result.guest);

      registerGuestInPhoneIndex(existingByPhone, {
        id: result.guest.id,
        phone: validated.data.phone,
        name: result.guest.name,
      });
    } catch {
      errors.push(`Ligne ${lineNumber}: échec d'enregistrement`);
    }
  }

  if (created.length === 0 && updated.length === 0) {
    return jsonError(errors[0] ?? "Aucun invité importé");
  }

  const parts = [
    created.length ? `${created.length} créé(s)` : null,
    assignedCount
      ? `${assignedCount} existant(s) affecté(s) (sans doublon)`
      : null,
  ].filter(Boolean);

  return jsonOk({
    message: parts.join(" · ") || "Import terminé",
    createdCount: created.length,
    updatedCount: assignedCount,
    errorCount: errors.length,
    errors: errors.slice(0, 20),
    guests: [...created, ...updated],
  });
}
