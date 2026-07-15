import { jsonError, jsonOk } from "@/lib/api-response";
import {
  deleteCeremonyGroup,
  updateCeremonyGroup,
} from "@/lib/admin/ceremonies";
import { requireAdmin } from "@/lib/admin-auth";

type RouteContext = {
  params: Promise<{ groupId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { groupId } = await context.params;
    const body = (await request.json()) as { name?: string };

    if (!groupId) return jsonError("Groupe manquant");
    if (!body.name?.trim()) return jsonError("Nom de groupe requis");

    const group = await updateCeremonyGroup(groupId, { name: body.name });
    return jsonOk({ group });
  } catch {
    return jsonError("Non autorisé", 401);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { groupId } = await context.params;
    if (!groupId) return jsonError("Groupe manquant");

    await deleteCeremonyGroup(groupId);
    return jsonOk({});
  } catch {
    return jsonError("Non autorisé", 401);
  }
}
