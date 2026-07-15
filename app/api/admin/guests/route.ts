import { jsonError, jsonOk } from "@/lib/api-response";
import { getAdminDashboardData } from "@/lib/admin/dashboard";
import {
  assignCeremoniesToExistingGuest,
  createGuestWithCeremonies,
} from "@/lib/admin/guest-assign";
import {
  normalizeCeremonyIds,
  validateGuestCreateInput,
} from "@/lib/admin/guest-create";
import { findGuestByPhoneForAdmin } from "@/lib/admin/guest-phone-lookup";
import { requireAdmin } from "@/lib/admin-auth";

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

  const existing = await findGuestByPhoneForAdmin(validated.data.phone);

  if (existing) {
    const result = await assignCeremoniesToExistingGuest({
      guestId: existing.id,
      phone: validated.data.phone,
      ceremonyIds: validated.data.ceremonyIds,
      guestName: existing.name,
    });

    return jsonOk({
      ...result,
      alreadyExists: true,
    });
  }

  const result = await createGuestWithCeremonies(validated.data);
  return jsonOk(result);
}
