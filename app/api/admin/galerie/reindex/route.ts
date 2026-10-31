import { jsonError, jsonOk } from "@/lib/api-response";
import { requireAdmin } from "@/lib/admin-auth";
import {
  getReindexStatus,
  ReindexConflictError,
  startReindex,
  stepReindex,
} from "@/lib/galerie/reindex";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  try {
    return jsonOk({ status: await getReindexStatus() });
  } catch (error) {
    console.error("[galerie] statut réindexation impossible", error);
    return jsonError("Statut de la réindexation indisponible.", 500);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };

  try {
    if (body.action === "start") return jsonOk({ status: await startReindex() });
    if (body.action === "step") return jsonOk({ status: await stepReindex() });
    return jsonError("Action inconnue");
  } catch (error) {
    if (error instanceof ReindexConflictError) {
      return jsonError(error.message, 409);
    }
    console.error("[galerie] réindexation impossible", error);
    return jsonError("La réindexation a échoué. Réessayez pour reprendre.", 500);
  }
}
