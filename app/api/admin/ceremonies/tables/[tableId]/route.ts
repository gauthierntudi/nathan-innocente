import { jsonError, jsonOk } from "@/lib/api-response";
import { deleteCeremonyTable, updateCeremonyTable } from "@/lib/admin/ceremonies";
import { requireAdmin } from "@/lib/admin-auth";

type RouteContext = {
  params: Promise<{ tableId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { tableId } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      capacity?: number | null;
    };

    if (body.name !== undefined && !body.name.trim()) {
      return jsonError("Nom de table requis");
    }

    const capacity =
      body.capacity === undefined
        ? undefined
        : body.capacity === null
          ? null
          : Number(body.capacity);

    if (capacity !== undefined && capacity !== null && (!Number.isFinite(capacity) || capacity < 1)) {
      return jsonError("Capacité invalide");
    }

    const table = await updateCeremonyTable(tableId, {
      name: body.name,
      capacity,
    });

    return jsonOk({ table });
  } catch {
    return jsonError("Non autorisé", 401);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { tableId } = await context.params;
    await deleteCeremonyTable(tableId);
    return jsonOk({});
  } catch {
    return jsonError("Non autorisé", 401);
  }
}
