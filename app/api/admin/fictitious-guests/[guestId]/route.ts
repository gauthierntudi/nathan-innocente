import { jsonError, jsonOk } from "@/lib/api-response";
import { assignRealPhoneToFictitiousGuest } from "@/lib/admin/fictitious-phone";
import { requireAdmin } from "@/lib/admin-auth";

type RouteContext = {
  params: Promise<{ guestId: string }>;
};

type Body = {
  phone?: string;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const { guestId } = await context.params;
  if (!guestId) return jsonError("Identifiant manquant");

  const body = (await request.json()) as Body;
  const phone = body.phone?.trim() ?? "";
  if (!phone) return jsonError("Le numéro réel est requis");

  try {
    const result = await assignRealPhoneToFictitiousGuest({ guestId, phone });
    return jsonOk(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Impossible d'assigner le numéro";
    const status =
      message === "Invité introuvable"
        ? 404
        : message.includes("déjà utilisé") || message.includes("invalide")
          ? 400
          : 500;
    return jsonError(message, status);
  }
}
