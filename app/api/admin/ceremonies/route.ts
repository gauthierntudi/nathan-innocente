import { jsonError, jsonOk } from "@/lib/api-response";
import { getCeremonyBoard } from "@/lib/admin/ceremonies";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    await requireAdmin();
    const board = await getCeremonyBoard();
    return jsonOk(board);
  } catch {
    return jsonError("Non autorisé", 401);
  }
}
