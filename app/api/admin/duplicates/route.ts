import { jsonError, jsonOk } from "@/lib/api-response";
import { listGuestDuplicates } from "@/lib/admin/guest-duplicates";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  try {
    const duplicates = await listGuestDuplicates();
    return jsonOk({
      duplicates,
      count: duplicates.length,
    });
  } catch (error) {
    console.error("GET /api/admin/duplicates", error);
    return jsonError("Impossible de charger les doublons", 500);
  }
}
