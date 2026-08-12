import { jsonError, jsonOk } from "@/lib/api-response";
import { resetDatabase } from "@/lib/admin/reset-db";
import { requireAdmin } from "@/lib/admin-auth";

type ResetBody = {
  confirm?: string;
};

/** Mot de confirmation attendu pour vider la base. */
export const RESET_DB_CONFIRM_WORD = "VIDER";

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const body = (await request.json().catch(() => ({}))) as ResetBody;
  const confirm = (body.confirm ?? "").trim().toUpperCase();

  if (confirm !== RESET_DB_CONFIRM_WORD) {
    return jsonError(
      `Confirmation invalide. Envoyez { "confirm": "${RESET_DB_CONFIRM_WORD}" }.`,
    );
  }

  try {
    const { before } = await resetDatabase();
    return jsonOk({
      message: `Base vidée — ${before.guests} invité(s), ${before.duplicates} doublon(s), ${before.assignments} affectation(s) supprimés`,
      before,
    });
  } catch (error) {
    console.error("POST /api/admin/reset-db", error);
    return jsonError("Échec du reset de la base", 500);
  }
}
