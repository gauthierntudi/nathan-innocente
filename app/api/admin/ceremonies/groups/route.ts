import { jsonError, jsonOk } from "@/lib/api-response";
import { createCeremonyGroup } from "@/lib/admin/ceremonies";
import { isCeremonyId } from "@/lib/admin/ceremony-types";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      ceremonyId?: string;
      name?: string;
    };

    if (!body.ceremonyId || !isCeremonyId(body.ceremonyId)) {
      return jsonError("Cérémonie invalide");
    }

    if (!body.name?.trim()) {
      return jsonError("Nom de groupe requis");
    }

    const group = await createCeremonyGroup({
      ceremonyId: body.ceremonyId,
      name: body.name,
    });

    return jsonOk({ group });
  } catch {
    return jsonError("Non autorisé", 401);
  }
}
