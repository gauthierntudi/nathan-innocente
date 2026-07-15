import { jsonError, jsonOk } from "@/lib/api-response";
import { syncGuestCeremonies } from "@/lib/admin/ceremonies";
import { normalizeCeremonyIds } from "@/lib/admin/guest-create";
import { serializeGuest } from "@/lib/admin/types";
import { requireAdmin } from "@/lib/admin-auth";
import { syncGuestAvailabilityAggregate } from "@/lib/guests";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

type UpdateGuestBody = {
  name?: string;
  phone?: string;
  numGuests?: number;
  ceremonyIds?: string[];
};

type RouteContext = {
  params: Promise<{ guestId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const { guestId } = await context.params;
  if (!guestId) {
    return jsonError("Invité manquant");
  }

  const existing = await prisma.guest.findUnique({ where: { id: guestId } });
  if (!existing) {
    return jsonError("Invité introuvable", 404);
  }

  const body = (await request.json()) as UpdateGuestBody;
  const name = body.name?.trim() ?? "";
  const phoneRaw = body.phone?.trim() ?? "";
  const numGuests = Number(body.numGuests);
  const ceremonyIds = normalizeCeremonyIds(body.ceremonyIds);

  if (!name) {
    return jsonError("Le nom est requis");
  }

  if (!phoneRaw) {
    return jsonError("Le numéro est requis");
  }

  if (!Number.isFinite(numGuests) || numGuests < 1 || numGuests > 50) {
    return jsonError("Le nombre de convives doit être entre 1 et 50");
  }

  const phone = normalizePhone(phoneRaw);
  if (phone.length < 8) {
    return jsonError("Numéro de téléphone invalide");
  }

  const phoneConflict = await prisma.guest.findFirst({
    where: {
      phone,
      NOT: { id: guestId },
    },
    select: { id: true, name: true },
  });

  if (phoneConflict) {
    return jsonError(`Ce numéro est déjà utilisé par ${phoneConflict.name}`);
  }

  const confirmedGuests = Math.min(existing.confirmedGuests, Math.floor(numGuests));

  await prisma.guest.update({
    where: { id: guestId },
    data: {
      name,
      phone,
      numGuests: Math.floor(numGuests),
      confirmedGuests,
    },
  });

  await syncGuestCeremonies(guestId, ceremonyIds);
  await syncGuestAvailabilityAggregate(guestId);

  const updated = await prisma.guest.findUniqueOrThrow({
    where: { id: guestId },
    include: {
      guestCeremonies: { select: { ceremonyId: true } },
    },
  });

  return jsonOk({
    message: `Invité « ${updated.name} » mis à jour`,
    guest: serializeGuest(updated),
  });
}
