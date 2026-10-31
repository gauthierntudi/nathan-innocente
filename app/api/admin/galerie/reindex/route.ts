import { after } from "next/server";

import { jsonError, jsonOk } from "@/lib/api-response";
import {
  ADMIN_COOKIE,
  createAdminSessionToken,
  requireAdmin,
} from "@/lib/admin-auth";
import {
  getReindexStatus,
  ReindexConflictError,
  startReindex,
  stepReindex,
} from "@/lib/galerie/reindex";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Lots ratés d’affilée avant d’arrêter : le bouton Reprendre prend le relais. */
const MAX_CONSECUTIVE_ERRORS = 3;

type Body = { action?: string; errors?: number };

/** Le lot tourne après la réponse, puis relance le suivant sans navigateur. */
function runBatchInBackground(url: string, errors = 0) {
  after(async () => {
    let nextErrors = 0;
    try {
      const { status, ran } = await stepReindex();
      if (!ran || status.phase === "done") return;
    } catch (error) {
      console.error("[galerie] lot de réindexation impossible", error);
      nextErrors = errors + 1;
      if (nextErrors >= MAX_CONSECUTIVE_ERRORS) return;
    }

    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${ADMIN_COOKIE}=${createAdminSessionToken()}`,
      },
      body: JSON.stringify({ action: "step", errors: nextErrors }),
    });
  });
}

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

  const body = (await request.json().catch(() => ({}))) as Body;

  try {
    if (body.action === "start") {
      const status = await startReindex();
      runBatchInBackground(request.url);
      return jsonOk({ status });
    }
    if (body.action === "step") {
      runBatchInBackground(request.url, Number(body.errors) || 0);
      return jsonOk({ status: await getReindexStatus() });
    }
    return jsonError("Action inconnue");
  } catch (error) {
    if (error instanceof ReindexConflictError) {
      return jsonError(error.message, 409);
    }
    console.error("[galerie] réindexation impossible", error);
    return jsonError("La réindexation a échoué. Réessayez pour reprendre.", 500);
  }
}
