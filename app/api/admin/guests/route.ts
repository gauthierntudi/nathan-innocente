import { jsonError, jsonOk } from "@/lib/api-response";
import { getAdminDashboardData } from "@/lib/admin/dashboard";
import { resolveGuestWrite } from "@/lib/admin/guest-assign";
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
  guestType?: string;
  groupName?: string;
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
    guestType: body.guestType,
    groupName: body.groupName,
    ceremonyIds: normalizeCeremonyIds(body.ceremonyIds),
  });

  if (!validated.ok) {
    return jsonError(validated.message);
  }

  const existing =
    validated.data.phoneFictitious || !validated.data.phone
      ? null
      : await findGuestByPhoneForAdmin(validated.data.phone);
  const result = await resolveGuestWrite(
    validated.data,
    existing
      ? { id: existing.id, name: existing.name, phone: existing.phone }
      : null,
  );

  if (result.kind === "duplicate") {
    return jsonOk({
      message: result.message,
      guest: result.guest,
      duplicate: result.duplicate,
      alreadyExists: true,
      isDuplicate: true,
    });
  }

  return jsonOk({
    message: result.message,
    guest: result.guest,
    alreadyExists: result.kind === "updated",
  });
}
