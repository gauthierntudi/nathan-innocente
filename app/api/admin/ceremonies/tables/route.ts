import { jsonError, jsonOk } from "@/lib/api-response";
import { createCeremonyTable } from "@/lib/admin/ceremonies";
import { isCeremonyId } from "@/lib/admin/ceremony-types";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      ceremonyId?: string;
      name?: string;
      capacity?: number | null;
    };

    if (!body.ceremonyId || !isCeremonyId(body.ceremonyId)) {
      return jsonError("Cérémonie invalide");
    }

    if (!body.name?.trim()) {
      return jsonError("Nom de table requis");
    }

    const capacity =
      body.capacity === null || body.capacity === undefined
        ? null
        : Number(body.capacity);

    if (capacity !== null && (!Number.isFinite(capacity) || capacity < 1)) {
      return jsonError("Capacité invalide");
    }

    const table = await createCeremonyTable({
      ceremonyId: body.ceremonyId,
      name: body.name,
      capacity,
    });

    return jsonOk({ table });
  } catch {
    return jsonError("Non autorisé", 401);
  }
}
