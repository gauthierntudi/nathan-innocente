import { jsonError, jsonOk } from "@/lib/api-response";
import { syncGuestCeremonies } from "@/lib/admin/ceremonies";
import {
  normalizeCeremonyIds,
  parseGuestsCsv,
  validateGuestCreateInput,
} from "@/lib/admin/guest-create";
import { serializeGuest } from "@/lib/admin/types";
import { requireAdmin } from "@/lib/admin-auth";
import { syncGuestAvailabilityAggregate } from "@/lib/guests";
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

  const existingPhones = new Set(
    (
      await prisma.guest.findMany({
        select: { phone: true },
      })
    ).map((guest) => guest.phone),
  );

  const created = [];
  const errors: string[] = [];
  let skipped = 0;

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

    if (existingPhones.has(validated.data.phone)) {
      skipped += 1;
      errors.push(
        `Ligne ${lineNumber}: numéro déjà existant (${validated.data.phone})`,
      );
      continue;
    }

    try {
      const guest = await prisma.guest.create({
        data: {
          name: validated.data.name,
          phone: validated.data.phone,
          numGuests: validated.data.numGuests,
          genre: validated.data.genre,
          token: validated.data.token,
        },
      });

      if (validated.data.ceremonyIds.length > 0) {
        await syncGuestCeremonies(guest.id, validated.data.ceremonyIds);
        await syncGuestAvailabilityAggregate(guest.id);
      }

      const withCeremonies = await prisma.guest.findUniqueOrThrow({
        where: { id: guest.id },
        include: {
          guestCeremonies: { select: { ceremonyId: true } },
        },
      });

      existingPhones.add(validated.data.phone);
      created.push(serializeGuest(withCeremonies));
    } catch {
      errors.push(`Ligne ${lineNumber}: échec d'enregistrement`);
    }
  }

  if (created.length === 0) {
    return jsonError(errors[0] ?? "Aucun invité importé");
  }

  return jsonOk({
    message: `${created.length} invité(s) importé(s)${skipped ? `, ${skipped} ignoré(s)` : ""}`,
    createdCount: created.length,
    skippedCount: skipped,
    errorCount: errors.length,
    errors: errors.slice(0, 20),
    guests: created,
  });
}
