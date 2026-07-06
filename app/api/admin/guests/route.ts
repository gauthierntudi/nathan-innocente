import { jsonError, jsonOk } from "@/lib/api-response";
import { getAdminDashboardData } from "@/lib/admin/dashboard";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    await requireAdmin();
    const data = await getAdminDashboardData();
    return jsonOk(data);
  } catch {
    return jsonError("Non autorisé", 401);
  }
}
