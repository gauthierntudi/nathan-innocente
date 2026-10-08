import { jsonError, jsonOk } from "@/lib/api-response";
import { completeLivenessSession } from "@/lib/galerie/liveness";
import { GalerieRekognitionError } from "@/lib/galerie/rekognition";

export const runtime = "nodejs";
export const maxDuration = 60;

const recentHits = new Map<string, number[]>();

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const recent = (recentHits.get(ip) ?? []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 30) {
    recentHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  recentHits.set(ip, recent);
  return false;
}

type Body = {
  sessionId?: string;
};

export async function POST(request: Request) {
  if (isRateLimited(clientIp(request))) {
    return jsonError("Trop de tentatives. Patientez un instant.", 429);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonError("Session invalide.");
  }

  const sessionId = body.sessionId?.trim() ?? "";
  if (!sessionId || sessionId.length > 128) {
    return jsonError("Session invalide.");
  }

  try {
    const result = await completeLivenessSession(sessionId);
    if (result.status === "not_live") {
      return jsonOk({
        status: "not_live",
        confidence: result.confidence,
        message: "Nous n’avons pas pu confirmer qu’il s’agit d’un visage réel. Réessayez.",
      });
    }
    if (result.status === "no_face") {
      return jsonOk({ status: "no_face" });
    }
    return jsonOk({
      status: "matched",
      confidence: result.confidence,
      albums: result.albums,
    });
  } catch (error) {
    if (error instanceof GalerieRekognitionError) {
      return jsonError(error.message, 503);
    }
    console.error("[galerie] finalisation liveness impossible", error);
    return jsonError("Le scan n’a pas pu aboutir. Réessayez.", 500);
  }
}
