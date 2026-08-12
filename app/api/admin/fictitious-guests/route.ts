import { jsonError, jsonOk } from "@/lib/api-response";
import { listFictitiousGuests } from "@/lib/admin/fictitious-phone";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  try {
    const guests = await listFictitiousGuests();
    return jsonOk({ guests, count: guests.length });
  } catch (error) {
    console.error("GET /api/admin/fictitious-guests", error);
    return jsonError("Impossible de charger les invités à numéro fictif", 500);
  }
}
