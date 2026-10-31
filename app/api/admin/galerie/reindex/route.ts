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
const QUEUE_ATTEMPTS = 3;
const QUEUE_TIMEOUT_MS = 3000;

type Body = { action?: string; errors?: number };

/** Sans ce relais la chaîne s’arrête : réessayer, un échec isolé ne doit pas la couper. */
async function queueNextBatch(url: string, errors: number) {
  for (let attempt = 1; attempt <= QUEUE_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${ADMIN_COOKIE}=${createAdminSessionToken()}`,
        },
        body: JSON.stringify({ action: "step", errors }),
        signal: AbortSignal.timeout(QUEUE_TIMEOUT_MS),
      });
      if (response.ok) return;
      console.error(`[galerie] relais du lot refusé : HTTP ${response.status}`);
    } catch (error) {
      console.error("[galerie] relais du lot impossible", error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/** Le lot tourne après la réponse, puis relance le suivant sans navigateur. */
function runBatchInBackground(url: string, errors: number) {
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

    await queueNextBatch(url, nextErrors);
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
      // Appel séparé : la préparation entame déjà les 60 s de celui-ci.
      after(() => queueNextBatch(request.url, 0));
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
