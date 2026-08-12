import { jsonError, jsonOk } from "@/lib/api-response";
import {
  resolveGuestDuplicate,
  type ResolveDuplicateAction,
} from "@/lib/admin/guest-duplicates";
import { requireAdmin } from "@/lib/admin-auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ResolveBody = {
  action?: ResolveDuplicateAction;
};

const ACTIONS: ResolveDuplicateAction[] = [
  "merge",
  "replace_name",
  "dismiss",
];

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const { id } = await context.params;
  if (!id) return jsonError("Identifiant manquant");

  const body = (await request.json()) as ResolveBody;
  const action = body.action;

  if (!action || !ACTIONS.includes(action)) {
    return jsonError("Action invalide (merge, replace_name, dismiss)");
  }

  try {
    const result = await resolveGuestDuplicate(id, action);
    return jsonOk(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Échec de résolution du doublon";
    const status = message === "Doublon introuvable" ? 404 : 500;
    return jsonError(message, status);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("Non autorisé", 401);
  }

  const { id } = await context.params;
  if (!id) return jsonError("Identifiant manquant");

  try {
    const result = await resolveGuestDuplicate(id, "dismiss");
    return jsonOk(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Échec de suppression du doublon";
    const status = message === "Doublon introuvable" ? 404 : 500;
    return jsonError(message, status);
  }
}
