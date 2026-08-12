import { jsonError, jsonOk } from "@/lib/api-response";
import { backfillCoupleCeremonySeats } from "@/lib/admin/guest-couple-backfill";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  try {
    const result = await backfillCoupleCeremonySeats();
    return jsonOk({
      message:
        result.coupleGuests === 0
          ? "Aucun invité couple détecté"
          : `Règle couple appliquée — ${result.coupleGuests} couple(s), ${result.guestsUpdated} invité(s) mis à jour, ${result.ceremonyRowsUpdated} cérémonie(s) corrigée(s)`,
      ...result,
    });
  } catch (error) {
    console.error("POST /api/admin/guests/couple-seats", error);
    return jsonError(
      error instanceof Error
        ? error.message
        : "Impossible d'appliquer la règle couple",
      500,
    );
  }
}
