import { jsonError, jsonOk } from "@/lib/api-response";
import { getCeremonyBoard } from "@/lib/admin/ceremonies";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  try {
    const board = await getCeremonyBoard();
    return jsonOk(board);
  } catch (error) {
    console.error("GET /api/admin/ceremonies", error);
    return jsonError(
      error instanceof Error ? error.message : "Impossible de charger les cérémonies",
      500,
    );
  }
}
