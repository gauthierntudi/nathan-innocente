import { jsonError, jsonOk } from "@/lib/api-response";
import { getAdminDashboardData } from "@/lib/admin/dashboard";
import {
  normalizeCeremonyIds,
  validateGuestCreateInput,
} from "@/lib/admin/guest-create";
import { syncGuestCeremonies } from "@/lib/admin/ceremonies";
import { serializeGuest } from "@/lib/admin/types";
import { requireAdmin } from "@/lib/admin-auth";
import { syncGuestAvailabilityAggregate } from "@/lib/guests";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await requireAdmin();
    const data = await getAdminDashboardData();
    return jsonOk(data);
  } catch {
    return jsonError("Non autorisé", 401);
  }
}

type CreateBody = {
  name?: string;
  phone?: string;
  numGuests?: number;
  genre?: string;
  ceremonyIds?: string[];
};

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json()) as CreateBody;
  const validated = validateGuestCreateInput({
    name: body.name ?? "",
    phone: body.phone ?? "",
    numGuests: body.numGuests,
    genre: body.genre,
    ceremonyIds: normalizeCeremonyIds(body.ceremonyIds),
  });

  if (!validated.ok) {
    return jsonError(validated.message);
  }

  const existing = await prisma.guest.findFirst({
    where: { phone: validated.data.phone },
    select: { id: true, name: true },
  });

  if (existing) {
    return jsonError(`Ce numéro est déjà utilisé par ${existing.name}`);
  }

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

  return jsonOk({
    message: `Invité « ${guest.name} » ajouté`,
    guest: serializeGuest(withCeremonies),
  });
}
